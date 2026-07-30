/*
 * SPDX-FileCopyrightText: 2024 Zextras <https://www.zextras.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { act } from '@testing-library/react';
import * as shell from '@zextras/carbonio-shell-ui';
import { HttpResponse } from 'msw';

import { MailsEditorV2 } from '../../../../types';
import { setupHook } from '@test-setup';
import {
	APIInterceptor,
	createAPIInterceptor
} from '@test-utils/network/msw/create-api-interceptor';
import { setupEditorStore } from '__test__/generators/editor-store';
import { generateNewMessageEditor } from 'store/editor/editor-generators';
import { useEditorDraftSave, useSaveDraftFromEditor } from 'store/editor/hooks/save-draft';

const setSaveDraftDelaySetting = (value: string | undefined): void => {
	vi.spyOn(shell, 'getUserSettings').mockImplementation(
		vi.fn(() => ({
			attrs: {},
			prefs: {
				zimbraPrefAutoSaveDraftInterval: value
			},
			props: []
		}))
	);
};

const unSetSaveDraftDelaySetting = (): void => {
	setSaveDraftDelaySetting(undefined);
};
const setupSaveDraftTest = (): { editor: MailsEditorV2 } => {
	const editor = generateNewMessageEditor();
	setupEditorStore({ editors: [editor] });
	return {
		editor
	};
};
const setupSaveDraftApi = (): { saveDraftApi: APIInterceptor } => ({
	saveDraftApi: createAPIInterceptor('post', '/service/soap/SaveDraftRequest', HttpResponse.json())
});

const expectedCallsAfterSeconds = async ({
	seconds,
	api,
	calls
}: {
	seconds: number;
	api: APIInterceptor;
	calls: number;
}): Promise<void> => {
	await vi.advanceTimersByTimeAsync(seconds * 1000);
	expect(api.getCalledTimes()).toBe(calls);
};

describe('useEditorDraftSave', () => {
	it('should return an object with specific data and callbacks', () => {
		const { editor } = setupSaveDraftTest();
		const { result: hookResult } = setupHook(useEditorDraftSave, {
			initialProps: [editor.id]
		});

		expect(hookResult.current).toEqual({
			status: {
				allowed: true
			},
			saveDraft: expect.anything()
		});
	});

	describe('Immediate save draft', () => {
		it('calls the SaveDraft immediately', async () => {
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.immediateSaveDraft());
			// Well, "Almost!" immediately
			await vi.advanceTimersByTimeAsync(100);
			expect(saveDraftApi.getCalledTimes()).toBe(1);
		});
	});
	describe('Debounced save draft', () => {
		it('calls the SaveDraft after 2s by default', async () => {
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 1 });
		});
		it('discards consecutive calls within 3 seconds and fires the debounce from the first call', async () => {
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			// First call schedules the debounce
			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 0 });
			// Second call at T=1s is within 3s – discarded, timer is NOT reset
			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			// Debounce from first call fires at T=2s (1 more second)
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 1 });
		});
	});

	describe('Debounced save draft - consecutive call throttling', () => {
		it('discards a second call that arrives within 3 seconds of the first', async () => {
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			// First call – should schedule the debounce
			act(() => hookResult.current.debouncedSaveDraft());
			// Second call within 3 seconds – should be discarded
			await vi.advanceTimersByTimeAsync(1000);
			act(() => hookResult.current.debouncedSaveDraft());

			// Only the first debounce should fire (2 s after first call)
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });
			// No further call after the (discarded) second debounce window
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });
		});

		it('allows a second call that arrives more than 3 seconds after the first', async () => {
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			// First call – debounce fires after 2 s
			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });

			// Second call – arrives more than 3 s after first (>3 s elapsed)
			await vi.advanceTimersByTimeAsync(1500); // total elapsed: 3.5 s
			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 2 });
		});
	});

	describe('Save draft delay based on settings', () => {
		it('calls SaveDraft after 1s if save draft setting is 1s (less than default)', async () => {
			setSaveDraftDelaySetting('1s');
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 1 });
		});
		it('calls SaveDraft after 2s if save draft setting is 3s (more than default)', async () => {
			setSaveDraftDelaySetting('3s');
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });
		});
		it('calls SaveDraft after 2s if save draft setting is not set', async () => {
			unSetSaveDraftDelaySetting();
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });
		});

		// FIXME: this is probably a bug in th code
		it('calls SaveDraft after 0s if save draft setting is 0s', async () => {
			setSaveDraftDelaySetting('0s');
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 1 });
		});
		it('calls SaveDraft after 2s if save draft setting is 0', async () => {
			setSaveDraftDelaySetting('0');
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });
		});
		it('calls SaveDraft after 2s if save draft setting is 2m (minutes)', async () => {
			setSaveDraftDelaySetting('2m');
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });
		});
		it('calls SaveDraft after 2s if save draft setting has no unit and is not 0', async () => {
			setSaveDraftDelaySetting('100');
			const { editor } = setupSaveDraftTest();
			const { result: hookResult } = setupHook(useSaveDraftFromEditor, {
				initialProps: [editor.id]
			});
			const { saveDraftApi } = setupSaveDraftApi();

			act(() => hookResult.current.debouncedSaveDraft());
			await expectedCallsAfterSeconds({ seconds: 0, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 1, api: saveDraftApi, calls: 0 });
			await expectedCallsAfterSeconds({ seconds: 2, api: saveDraftApi, calls: 1 });
		});
	});
});

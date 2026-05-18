/*
 * SPDX-FileCopyrightText: 2024 Zextras <https://www.zextras.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { legacySoapFetch } from '@zextras/carbonio-ui-soap-lib';

import { SoapContact } from 'types/soap/soap';

type SearchContactsRequest = {
	_jsns: 'urn:zimbraMail';
	types: 'contact';
	query: string;
	limit: number;
	offset?: number;
};

export type SearchContactsResponse = {
	cn?: Array<SoapContact>;
	more?: boolean;
	offset?: number;
};

/**
 * Search contacts from the user's own contact folders using SearchRequest.
 * Does NOT use AutoCompleteGal.
 *
 * @param searchText - The text to search for (empty string returns all contacts)
 * @param limit - Max results to return (default 100)
 * @param offset - Pagination offset
 */
export async function searchContactsSoapApi({
	searchText = '',
	limit = 100,
	offset
}: {
	searchText?: string;
	limit?: number;
	offset?: number;
}): Promise<SearchContactsResponse> {
	const query = searchText.trim() ? `in:contacts "${searchText}"` : 'in:contacts';

	return legacySoapFetch<SearchContactsRequest, SearchContactsResponse>('Search', {
		_jsns: 'urn:zimbraMail',
		types: 'contact',
		query,
		limit,
		offset
	});
}

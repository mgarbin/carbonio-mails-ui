/*
 * SPDX-FileCopyrightText: 2023 Zextras <https://www.zextras.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { FC, useCallback, useMemo, useState } from 'react';

import { Button, Container, Tooltip } from '@zextras/carbonio-design-system';
import {
	CONTACT_TYPES,
	ContactInputItem,
	ParticipantRoleType,
	useContactInput
} from '@zextras/carbonio-ui-commons';
import { t } from '@zextras/carbonio-shell-ui';
import { map, some, uniqBy } from 'lodash';

import { Participant } from 'types';
import {
	ContactPickerModal,
	PickedContact
} from 'views/app/detail-panel/edit/parts/contact-picker-modal';
import { isValidEmail } from 'views/search/parts/utils';

/**
 * Get the name for a contact based on available fields
 * @param contact - The contact input item
 * @returns The contact name or undefined
 */
const getContactName = (contact: ContactInputItem): string | undefined => {
	if (contact.value.type !== CONTACT_TYPES.CONTACT) {
		return undefined;
	}

	if (contact.value.fullName) {
		return contact.value.fullName;
	}

	if (contact.value.firstName && contact.value.lastName) {
		return `${contact.value.firstName} ${contact.value.lastName}`;
	}

	return contact.value.firstName;
};

export type RecipientsRowProps = {
	type: ParticipantRoleType;
	label: string;
	recipients: Array<Participant>;
	onRecipientsChange: (recipients: Array<Participant>) => void;
	dataTestid?: string;
	orderedAccountIds?: Array<string>;
};

/**
 * The component handle the input for participants of the given type
 * @param type
 * @param label
 * @param recipients
 * @param onRecipientsChange
 * @param dataTestid
 * @param orderedAccountIds
 * @constructor
 */
export const RecipientsRow: FC<RecipientsRowProps> = ({
	type,
	label,
	recipients,
	onRecipientsChange,
	dataTestid,
	orderedAccountIds
}) => {
	const ContactInput = useContactInput();
	const [contacts, setContacts] = useState<Record<string, ContactInputItem | undefined>>({});
	const [pickerOpen, setPickerOpen] = useState(false);

	const onContactInputChange = useCallback(
		(contactChips: Array<ContactInputItem>): void => {
			const newContactsState = {} as Record<string, ContactInputItem>;
			contactChips.forEach((contact) => {
				newContactsState[contact.value.email] = contact;
			});
			setContacts(newContactsState);
			const updatedRecipients = map<ContactInputItem, Participant>(contactChips, (contact) => {
				const alreadyExists = recipients.find(
					(recipient) => recipient.address === contact.value.email
				);
				const isGroup = contact.value.type === CONTACT_TYPES.DISTRIBUTION_LIST;
				return (
					alreadyExists || {
						id: contact.id,
						type,
						address: contact.value.email,
						isGroup,
						name: getContactName(contact)
					}
				);
			});
			onRecipientsChange(updatedRecipients);
		},
		[onRecipientsChange, recipients, type]
	);

	const recipientsAsContacts = useMemo(
		() =>
			map<Participant, ContactInputItem>(recipients, (recipient) => {
				const email = recipient.address;
				const exists = contacts[email];
				return (
					exists ?? {
						id: recipient.address,
						label: recipient.address,
						value: {
							id: recipient.address,
							email: recipient.address,
							type: recipient.isGroup ? CONTACT_TYPES.DISTRIBUTION_LIST : CONTACT_TYPES.CONTACT
						},
						error: !isValidEmail(recipient.address)
					}
				);
			}),
		[contacts, recipients]
	);

	const openPicker = useCallback(() => setPickerOpen(true), []);
	const closePicker = useCallback(() => setPickerOpen(false), []);

	const initialPickerSelected = useMemo<Array<PickedContact>>(
		() =>
			recipients
				.filter((r) => isValidEmail(r.address))
				.map((r) => ({
					id: r.address,
					email: r.address,
					displayName: r.name ?? r.address
				})),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

	const onPickerConfirm = useCallback(
		(picked: Array<PickedContact>) => {
			const merged = uniqBy(
				[
					...recipients,
					...picked.map((c) => ({
						id: c.id,
						type,
						address: c.email,
						name: c.displayName !== c.email ? c.displayName : undefined,
						isGroup: false
					}))
				],
				'address'
			);
			onRecipientsChange(merged);
			closePicker();
		},
		[closePicker, onRecipientsChange, recipients, type]
	);

	return (
		<Container orientation="horizontal" width="fill" padding={{ all: 0 }}>
			<Container style={{ overflow: 'hidden', flex: 1 }}>
				<ContactInput
					data-testid={dataTestid}
					placeholder={label}
					onChange={onContactInputChange}
					defaultValue={recipientsAsContacts}
					hasError={some(recipientsAsContacts ?? [], { error: true })}
					dragAndDropEnabled
					orderedAccountIds={orderedAccountIds}
				/>
			</Container>
			<Tooltip label={t('label.open_contact_picker', 'Pick from contacts')}>
				<Button
					type="ghost"
					icon="PeopleOutline"
					size="large"
					color="gray0"
					onClick={openPicker}
					data-testid={`contact-picker-button-${type}`}
				/>
			</Tooltip>
			{pickerOpen && (
				<ContactPickerModal
					open={pickerOpen}
					title={t('label.select_contact', 'Select a contact')}
					onConfirm={onPickerConfirm}
					onClose={closePicker}
					initialSelected={initialPickerSelected}
				/>
			)}
		</Container>
	);
};

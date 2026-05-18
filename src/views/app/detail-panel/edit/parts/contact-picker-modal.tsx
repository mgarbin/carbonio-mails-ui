/*
 * SPDX-FileCopyrightText: 2024 Zextras <https://www.zextras.com>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, {
	FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	DragEvent
} from 'react';

import {
	Avatar,
	Button,
	Chip,
	Container,
	CustomModal,
	Divider,
	Icon,
	Input,
	Row,
	Text,
	Tooltip
} from '@zextras/carbonio-design-system';
import { t } from '@zextras/carbonio-shell-ui';
import { ModalFooter, ModalHeader } from '@zextras/carbonio-ui-commons';
import { debounce, uniqBy } from 'lodash';

import { searchContactsSoapApi } from 'api/search-contacts-soap-api';
import { GapContainer, GapRow } from 'commons/gap-container';
import { SoapContact } from 'types/soap/soap';

export type PickedContact = {
	id: string;
	email: string;
	displayName: string;
	firstName?: string;
	lastName?: string;
};

export type ContactPickerModalProps = {
	open: boolean;
	title: string;
	onConfirm: (contacts: Array<PickedContact>) => void;
	onClose: () => void;
	initialSelected?: Array<PickedContact>;
};

const getDisplayName = (contact: SoapContact): string => {
	const attrs = contact._attrs;
	if (attrs.fullName) return attrs.fullName;
	if (attrs.firstName && attrs.lastName) return `${attrs.firstName} ${attrs.lastName}`;
	if (attrs.firstName) return attrs.firstName;
	if (attrs.lastName) return attrs.lastName;
	return attrs.email ?? contact.fileAsStr ?? '';
};

const soapContactToPicked = (contact: SoapContact): PickedContact | null => {
	const email = contact._attrs.email;
	if (!email) return null;
	return {
		id: contact.id,
		email,
		displayName: getDisplayName(contact),
		firstName: contact._attrs.firstName,
		lastName: contact._attrs.lastName
	};
};

export const ContactPickerModal: FC<ContactPickerModalProps> = ({
	open,
	title,
	onConfirm,
	onClose,
	initialSelected = []
}) => {
	const [searchText, setSearchText] = useState('');
	const [contacts, setContacts] = useState<Array<SoapContact>>([]);
	const [loading, setLoading] = useState(false);
	const [selected, setSelected] = useState<Array<PickedContact>>(initialSelected);
	const [dragOverTarget, setDragOverTarget] = useState(false);
	const dragContactRef = useRef<PickedContact | null>(null);

	const fetchContacts = useCallback((text: string) => {
		setLoading(true);
		searchContactsSoapApi({ searchText: text })
			.then((response) => {
				setContacts(response.cn ?? []);
			})
			.catch(() => {
				setContacts([]);
			})
			.finally(() => {
				setLoading(false);
			});
	}, []);

	// eslint-disable-next-line react-hooks/exhaustive-deps
	const debouncedFetch = useMemo(() => debounce(fetchContacts, 300), [fetchContacts]);

	useEffect(() => {
		fetchContacts('');
	}, [fetchContacts]);

	const onSearchChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setSearchText(value);
			debouncedFetch(value);
		},
		[debouncedFetch]
	);

	const onClearSearch = useCallback(() => {
		setSearchText('');
		fetchContacts('');
	}, [fetchContacts]);

	const filteredContacts = useMemo<Array<PickedContact>>(
		() =>
			contacts.reduce<Array<PickedContact>>((acc, c) => {
				const picked = soapContactToPicked(c);
				if (picked) acc.push(picked);
				return acc;
			}, []),
		[contacts]
	);

	const addToSelected = useCallback((contact: PickedContact) => {
		setSelected((prev) => uniqBy([...prev, contact], 'email'));
	}, []);

	const removeFromSelected = useCallback((email: string) => {
		setSelected((prev) => prev.filter((c) => c.email !== email));
	}, []);

	const onConfirmClick = useCallback(() => {
		onConfirm(selected);
	}, [onConfirm, selected]);

	/* Drag-and-drop: drag a contact from the left list */
	const onDragStart = useCallback(
		(e: DragEvent<HTMLDivElement>, contact: PickedContact) => {
			dragContactRef.current = contact;
			e.dataTransfer.effectAllowed = 'copy';
		},
		[]
	);

	const onDropZoneDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		setDragOverTarget(true);
	}, []);

	const onDropZoneDragLeave = useCallback(() => {
		setDragOverTarget(false);
	}, []);

	const onDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setDragOverTarget(false);
			if (dragContactRef.current) {
				addToSelected(dragContactRef.current);
				dragContactRef.current = null;
			}
		},
		[addToSelected]
	);

	return (
		<CustomModal open={open} onClose={onClose} maxHeight="90vh" size="large">
			<ModalHeader onClose={onClose} title={title} showCloseIcon />
			<Divider />
			<Container
				orientation="horizontal"
				crossAlignment="flex-start"
				height="28rem"
				padding={{ top: 'medium', bottom: 'medium' }}
				gap={'1rem'}
			>
				{/* Left column: search + contacts list */}
				<Container
					width="50%"
					height="fill"
					crossAlignment="flex-start"
					gap={'0.5rem'}
				>
					<Input
						label={t('label.search', 'Search')}
						value={searchText}
						onChange={onSearchChange}
						CustomIcon={
							searchText
								? (): React.JSX.Element => (
										<Tooltip label={t('label.clear_search', 'Clear search')}>
											<Icon
												icon="CloseOutline"
												onClick={onClearSearch}
												style={{ cursor: 'pointer' }}
											/>
										</Tooltip>
									)
								: (): React.JSX.Element => <Icon icon="SearchOutline" />
						}
						data-testid="contact-picker-search-input"
					/>
					<Container
						height="fill"
						crossAlignment="flex-start"
						style={{
							overflowY: 'auto',
							border: '1px solid var(--border-color, #ccc)',
							borderRadius: '4px'
						}}
						padding={{ all: 'extrasmall' }}
					>
						{loading && (
							<Container mainAlignment="center" padding={{ all: 'medium' }}>
								<Text color="secondary">{t('label.loading', 'Loading...')}</Text>
							</Container>
						)}
						{!loading && filteredContacts.length === 0 && (
							<Container mainAlignment="center" padding={{ all: 'medium' }}>
								<Text color="secondary">
									{t('label.no_contacts_found', 'No contacts found')}
								</Text>
							</Container>
						)}
						{!loading &&
							filteredContacts.map((contact) => (
								<Row
									key={contact.id}
									width="fill"
									padding={{ all: 'extrasmall' }}
									mainAlignment="flex-start"
									style={{
										cursor: 'grab',
										borderRadius: '4px',
										userSelect: 'none'
									}}
									draggable
									onDragStart={(e: DragEvent<HTMLDivElement>): void =>
										onDragStart(e, contact)
									}
									onClick={(): void => addToSelected(contact)}
									data-testid={`contact-picker-item-${contact.id}`}
								>
									<GapRow gap={'0.5rem'} width="fill">
										<Avatar label={contact.displayName} size="small" />
										<Container crossAlignment="flex-start" style={{ overflow: 'hidden' }}>
											<Text size="small" style={{ fontWeight: 'bold' }}>
												{contact.displayName}
											</Text>
											<Text size="extrasmall" color="secondary" overflow="ellipsis">
												{contact.email}
											</Text>
										</Container>
										<Tooltip
											label={t('label.add_recipient', 'Add as recipient')}
										>
											<Button
												type="ghost"
												icon="PersonAddOutline"
												size="small"
												onClick={(e): void => {
													e.stopPropagation();
													addToSelected(contact);
												}}
											/>
										</Tooltip>
									</GapRow>
								</Row>
							))}
					</Container>
				</Container>

				<Divider orientation="vertical" />

				{/* Right column: selected contacts drop zone */}
				<Container
					width="50%"
					height="fill"
					crossAlignment="flex-start"
					gap={'0.5rem'}
				>
					<GapContainer gap={'0.25rem'} crossAlignment="flex-start">
						<Text size="small" weight="bold">
							{t('label.selected_recipients', 'Selected recipients')}
						</Text>
						<Text size="extrasmall" color="secondary">
							{t(
								'label.drag_or_click_contacts',
								'Drag contacts here or click to add them'
							)}
						</Text>
					</GapContainer>
					<Container
						height="fill"
						crossAlignment="flex-start"
						onDragOver={onDropZoneDragOver}
						onDragLeave={onDropZoneDragLeave}
						onDrop={onDrop}
						style={{
							overflowY: 'auto',
							border: `2px dashed ${dragOverTarget ? 'var(--color-primary, #2b73d2)' : '#ccc'}`,
							borderRadius: '4px',
							backgroundColor: dragOverTarget ? 'rgba(43,115,210,0.05)' : undefined,
							transition: 'border-color 0.15s, background-color 0.15s',
							width: '100%'
						}}
						padding={{ all: 'extrasmall' }}
					>
						{selected.length === 0 && (
							<Container mainAlignment="center" height="fill" padding={{ all: 'medium' }}>
								<Icon
									icon="PersonOutline"
									size="large"
									color="secondary"
								/>
								<Text color="secondary" size="small" style={{ marginTop: '0.5rem' }}>
									{t('label.no_recipients_selected', 'No recipients selected yet')}
								</Text>
							</Container>
						)}
						{selected.map((contact) => (
							<Row
								key={contact.email}
								width="fill"
								padding={{ all: 'extrasmall' }}
								mainAlignment="flex-start"
							>
								<Chip
									label={contact.displayName ?? contact.email}
									onClose={(): void => removeFromSelected(contact.email)}
									data-testid={`contact-picker-selected-${contact.email}`}
								/>
							</Row>
						))}
					</Container>
				</Container>
			</Container>
			<Divider />
			<ModalFooter
				confirmLabel={t('label.confirm', 'Confirm')}
				confirmDisabled={selected.length === 0}
				onConfirm={onConfirmClick}
				onSecondaryAction={onClose}
				secondaryActionLabel={t('label.cancel', 'Cancel')}
				onClose={onClose}
			/>
		</CustomModal>
	);
};

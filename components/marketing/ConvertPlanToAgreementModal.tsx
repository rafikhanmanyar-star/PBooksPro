import React, { useEffect, useMemo, useState } from 'react';
import {
    Contact,
    ContactType,
    InstallmentPlan,
    Project,
    ProjectAgreement,
    ProjectAgreementStatus,
    Unit,
} from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Textarea from '../ui/Textarea';
import { toLocalDateString } from '../../utils/dateUtils';
import { buildNextProjectAgreementNumber } from '../../utils/projectAgreementNumber';
import { CURRENCY } from '../../constants';

export type ConvertPlanToAgreementConfig = {
    targetContactType: ContactType;
    issueDate: string;
    description: string;
};

const AGREEMENT_CLIENT_TYPES: ContactType[] = [
    ContactType.OWNER,
    ContactType.CLIENT,
    ContactType.LEAD,
];

function formatMoney(value: number): string {
    return `${CURRENCY} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** @deprecated Use buildNextProjectAgreementNumber from utils/projectAgreementNumber */
export function buildAgreementNumberPreview(
    projectAgreements: ProjectAgreement[],
    settings?: { prefix?: string; nextNumber?: number; padding?: number }
): string {
    return buildNextProjectAgreementNumber(projectAgreements, settings);
}

export function buildConvertInvoicePreview(plan: InstallmentPlan) {
    const downPaymentAmount = plan.downPaymentAmount || 0;
    const installmentAmount = plan.installmentAmount || 0;
    const totalInstallments = plan.totalInstallments || 0;
    const invoiceCount =
        (downPaymentAmount > 0 ? 1 : 0) + (installmentAmount > 0 ? totalInstallments : 0);
    return {
        invoiceCount,
        downPaymentAmount,
        installmentAmount,
        totalInstallments,
        frequency: plan.frequency,
    };
}

type ConvertPlanToAgreementModalProps = {
    isOpen: boolean;
    plan: InstallmentPlan | null;
    contact: Contact | null;
    project: Project | undefined;
    unit: Unit | undefined;
    projectAgreements: ProjectAgreement[];
    agreementSettings?: { prefix?: string; nextNumber?: number; padding?: number };
    onClose: () => void;
    onConfirm: (config: ConvertPlanToAgreementConfig) => void;
    isSubmitting?: boolean;
};

const ConvertPlanToAgreementModal: React.FC<ConvertPlanToAgreementModalProps> = ({
    isOpen,
    plan,
    contact,
    project,
    unit,
    projectAgreements,
    agreementSettings,
    onClose,
    onConfirm,
    isSubmitting = false,
}) => {
    const defaultContactType =
        contact?.type === ContactType.LEAD ? ContactType.OWNER : contact?.type ?? ContactType.OWNER;

    const [targetContactType, setTargetContactType] = useState<ContactType>(defaultContactType);
    const [issueDate, setIssueDate] = useState(toLocalDateString(new Date()));
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (!isOpen || !plan) return;
        setTargetContactType(
            contact?.type === ContactType.LEAD ? ContactType.OWNER : contact?.type ?? ContactType.OWNER
        );
        setIssueDate(toLocalDateString(new Date()));
        setDescription(plan.description?.trim() || 'Converted from installment plan');
    }, [isOpen, plan, contact?.type, contact?.id]);

    const agreementNumber = useMemo(
        () => buildAgreementNumberPreview(projectAgreements, agreementSettings),
        [projectAgreements, agreementSettings]
    );

    const netValue = useMemo(() => {
        if (!plan) return 0;
        return (plan.netValue || 0) + (plan.amenitiesTotal || 0);
    }, [plan]);

    const invoicePreview = useMemo(
        () => (plan ? buildConvertInvoicePreview(plan) : null),
        [plan]
    );

    const contactTypeChanged = contact && targetContactType !== contact.type;
    const needsOwnerWarning =
        targetContactType === ContactType.LEAD &&
        contact?.type !== ContactType.LEAD;

    if (!isOpen || !plan || !contact) return null;

    const contactTypeItems = AGREEMENT_CLIENT_TYPES.map((type) => ({ id: type, name: type }));

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Convert Plan to Agreement"
            size="xl"
            preventCloseWhile={isSubmitting}
        >
            <div className="space-y-5">
                <p className="text-sm text-app-muted">
                    Review the agreement details below. You can change the client contact type before creating the
                    agreement and invoices.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <section className="rounded-lg border border-app-border bg-app-toolbar/40 p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-app-text">Client</h3>
                        <div className="text-sm space-y-1">
                            <div>
                                <span className="text-app-muted">Name: </span>
                                <span className="font-medium text-app-text">{contact.name}</span>
                            </div>
                            {contact.contactNo && (
                                <div>
                                    <span className="text-app-muted">Phone: </span>
                                    <span>{contact.contactNo}</span>
                                </div>
                            )}
                            <div>
                                <span className="text-app-muted">Current type: </span>
                                <span>{contact.type}</span>
                            </div>
                        </div>
                        <ComboBox
                            label="Contact type for agreement"
                            items={contactTypeItems}
                            selectedId={targetContactType}
                            onSelect={(item) => setTargetContactType((item?.id as ContactType) || ContactType.OWNER)}
                            placeholder="Select contact type"
                            allowAddNew={false}
                            entityType="report"
                        />
                        {contactTypeChanged && (
                            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                                The contact will be updated from <strong>{contact.type}</strong> to{' '}
                                <strong>{targetContactType}</strong> when you create the agreement.
                            </p>
                        )}
                        {targetContactType === ContactType.LEAD && (
                            <p className="text-xs text-app-muted">
                                Tip: Project agreements usually use an Owner or Client contact. Lead is allowed but
                                you may want to promote the contact to Owner.
                            </p>
                        )}
                        {needsOwnerWarning && (
                            <p className="text-xs text-ds-danger">
                                Selected type is Lead. Consider Owner for property sales agreements.
                            </p>
                        )}
                    </section>

                    <section className="rounded-lg border border-app-border bg-app-toolbar/40 p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-app-text">Property</h3>
                        <div className="text-sm space-y-1">
                            <div>
                                <span className="text-app-muted">Project: </span>
                                <span className="font-medium text-app-text">{project?.name || '—'}</span>
                            </div>
                            <div>
                                <span className="text-app-muted">Unit: </span>
                                <span className="font-medium text-app-text">{unit?.name || '—'}</span>
                            </div>
                            <div>
                                <span className="text-app-muted">Plan status: </span>
                                <span>{plan.status}</span>
                            </div>
                        </div>
                    </section>
                </div>

                <section className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-app-text">Agreement preview</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                            <span className="text-app-muted">Agreement no.: </span>
                            <span className="font-semibold text-app-text">{agreementNumber}</span>
                        </div>
                        <div>
                            <span className="text-app-muted">Status: </span>
                            <span>{ProjectAgreementStatus.ACTIVE}</span>
                        </div>
                        <div>
                            <span className="text-app-muted">Selling price: </span>
                            <span className="font-semibold text-app-text">{formatMoney(netValue)}</span>
                        </div>
                        <div>
                            <span className="text-app-muted">List price: </span>
                            <span>{formatMoney(plan.listPrice || 0)}</span>
                        </div>
                        <div>
                            <span className="text-app-muted">Down payment: </span>
                            <span>
                                {plan.downPaymentPercentage}% ({formatMoney(plan.downPaymentAmount || 0)})
                            </span>
                        </div>
                        <div>
                            <span className="text-app-muted">Installments: </span>
                            <span>
                                {plan.totalInstallments} × {formatMoney(plan.installmentAmount || 0)} ({plan.frequency})
                            </span>
                        </div>
                        <div>
                            <span className="text-app-muted">Duration: </span>
                            <span>
                                {plan.durationYears} year{plan.durationYears === 1 ? '' : 's'}
                            </span>
                        </div>
                        <div>
                            <span className="text-app-muted">Client on agreement: </span>
                            <span>
                                {contact.name} ({targetContactType})
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DatePicker label="Agreement issue date" value={issueDate} onChange={setIssueDate} />
                        <div className="md:col-span-2">
                            <Textarea
                                label="Agreement description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                            />
                        </div>
                    </div>
                </section>

                {invoicePreview && (
                    <section className="rounded-lg border border-app-border p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-app-text">Invoices to be generated</h3>
                        <ul className="text-sm text-app-muted list-disc pl-5 space-y-1">
                            {invoicePreview.downPaymentAmount > 0 && (
                                <li>1 down payment invoice — {formatMoney(invoicePreview.downPaymentAmount)}</li>
                            )}
                            {invoicePreview.installmentAmount > 0 && invoicePreview.totalInstallments > 0 && (
                                <li>
                                    {invoicePreview.totalInstallments} installment invoice
                                    {invoicePreview.totalInstallments === 1 ? '' : 's'} —{' '}
                                    {formatMoney(invoicePreview.installmentAmount)} each ({invoicePreview.frequency})
                                </li>
                            )}
                            <li className="font-medium text-app-text">
                                Total invoices: {invoicePreview.invoiceCount}
                            </li>
                        </ul>
                        <p className="text-xs text-app-muted">
                            Unit ownership will be assigned to {contact.name}. The marketing plan will be locked as
                            Sale Recognized.
                        </p>
                    </section>
                )}

                <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-app-border">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        className="bg-indigo-600 hover:bg-indigo-700"
                        disabled={isSubmitting || !issueDate.trim()}
                        onClick={() =>
                            onConfirm({
                                targetContactType,
                                issueDate,
                                description: description.trim() || 'Converted from installment plan',
                            })
                        }
                    >
                        {isSubmitting ? 'Creating…' : 'Create Agreement'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ConvertPlanToAgreementModal;

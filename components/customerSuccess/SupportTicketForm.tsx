import React, { useState } from 'react';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Input from '../ui/Input';
import { supportApi, type SupportTicketType } from '../../services/api/supportApi';
import { useNotification } from '../../context/NotificationContext';

type Props = {
  ticketType: SupportTicketType;
  title: string;
  description: string;
  subjectPlaceholder?: string;
  defaultName?: string;
  defaultEmail?: string;
  defaultOrganization?: string;
};

const SupportTicketForm: React.FC<Props> = ({
  ticketType,
  title,
  description,
  subjectPlaceholder = 'Brief summary',
  defaultName = '',
  defaultEmail = '',
  defaultOrganization = '',
}) => {
  const { showToast } = useNotification();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [organization, setOrganization] = useState(defaultOrganization);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      showToast('Please fill in all required fields.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const res = await supportApi.createTicket({
        ticketType,
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        organization: organization.trim() || undefined,
      });
      showToast(`Ticket ${res.ticketNumber} submitted. We'll respond by email.`, 'success');
      setSubject('');
      setMessage('');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Could not submit ticket. Email support@pbookspro.com directly.';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <h4 className="font-semibold text-slate-800">{title}</h4>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Your name *" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <Input
        label="Organization"
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
      />
      <Input
        label="Subject *"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={subjectPlaceholder}
        required
      />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Message *</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          placeholder="Describe your request in detail…"
        />
      </div>
      <LoadingButton type="submit" loading={submitting} loadingText="Submitting…">
        Submit
      </LoadingButton>
    </form>
  );
};

export default SupportTicketForm;

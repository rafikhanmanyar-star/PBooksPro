export type NotificationBadgeTone = 'blue' | 'green' | 'red' | 'orange' | 'slate';

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  badge: {
    label: string;
    tone: NotificationBadgeTone;
  };
  action:
    | { type: 'installment_plan'; planId: string }
    | { type: 'whatsapp'; phoneNumber: string; contactId?: string; contactName?: string }
    | { type: 'personal_task'; taskId: string }
    | { type: 'unposted'; transactionId?: string };
};

export type TaskBellRow = {
  id: string;
  title: string;
  targetDate: string;
  status: string;
  updatedAt?: string;
  createdAt?: string;
};

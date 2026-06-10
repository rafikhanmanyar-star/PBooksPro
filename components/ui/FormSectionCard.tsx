import React, { ReactNode } from 'react';

interface FormSectionCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  /** Optional id for aria-labelledby on the section */
  id?: string;
}

const FormSectionCard: React.FC<FormSectionCardProps> = ({
  title,
  icon,
  children,
  className = '',
  headerAction,
  id,
}) => {
  const titleId = id ? `${id}-title` : undefined;

  return (
    <section
      className={`ds-card p-5 sm:p-6 ${className}`}
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-app-table-selected text-ds-primary"
            aria-hidden="true"
          >
            {icon}
          </div>
          <h3 id={titleId} className="text-ds-body font-semibold text-app-text truncate">
            {title}
          </h3>
        </div>
        {headerAction}
      </div>
      {children}
    </section>
  );
};

export default FormSectionCard;

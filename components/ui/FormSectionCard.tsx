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
      className={`bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6 ${className}`}
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"
            aria-hidden="true"
          >
            {icon}
          </div>
          <h3 id={titleId} className="text-sm font-semibold text-slate-800 truncate">
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

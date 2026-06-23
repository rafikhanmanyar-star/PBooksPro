import React from 'react';
import ApprovalQueuePanel from './ApprovalQueuePanel';

const ApprovalsPage: React.FC = () => {
  return (
    <div className="page-content approvals-page">
      <div className="page-header">
        <h1 className="page-title">Approvals</h1>
      </div>
      <ApprovalQueuePanel />
    </div>
  );
};

export default ApprovalsPage;

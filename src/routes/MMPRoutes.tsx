
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import MMP from '@/pages/MMP';
import MMPUpload from '@/pages/MMPUpload';
import MMPVerification from '@/pages/MMPVerification';
import MMPDetailedVerification from '@/pages/MMPDetailedVerification';
import MMPVerificationPage from '@/pages/MMPVerificationPage';
import MMPPermitMessagePage from '@/pages/mmp/MMPPermitMessagePage';
import MMPDetailView from '@/pages/MMPDetailView';
import EditMMP from '@/pages/EditMMP';
import ReviewAssignCoordinators from '@/pages/ReviewAssignCoordinators';

const MMPRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<MMP />} />
      <Route path="/upload" element={<MMPUpload />} />
      <Route path="/:id/verify" element={<MMPVerification />} />
      <Route path="/:id/detailed-verification" element={<MMPDetailedVerification />} />
      <Route path="/:id/verification" element={<MMPVerificationPage />} />
      <Route path="/:id/permit-message" element={<MMPPermitMessagePage />} />
      <Route path="/:id" element={<MMPDetailView />} />
      <Route path="/:id/view" element={<MMPDetailView />} />
      <Route path="/:id/edit" element={<EditMMP />} />
      <Route path="/:id/review-assign-coordinators" element={<ReviewAssignCoordinators />} />
    </Routes>
  );
};

export default MMPRoutes;

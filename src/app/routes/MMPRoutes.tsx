
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import MMP from '@/features/mmp/MMP';
import MMPUpload from '@/features/mmp/MMPUpload';
import MMPVerification from '@/features/mmp/MMPVerification';
import MMPDetailedVerification from '@/features/mmp/MMPDetailedVerification';
import MMPVerificationPage from '@/features/mmp/MMPVerificationPage';
import MMPPermitMessagePage from '@/features/mmp/MMPPermitMessagePage';
import MMPDetailView from '@/features/mmp/MMPDetailView';
import EditMMP from '@/features/mmp/EditMMP';
import ReviewAssignCoordinators from '@/features/coordinator/ReviewAssignCoordinators';

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

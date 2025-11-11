import React from 'react';
import { useLocation, Link } from 'react-router-dom';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const GlobalSearchPage = () => {
  const query = useQuery().get('q')?.toLowerCase() || '';

  // Example: search through static routes/features (expand as needed)
  const features = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Projects', path: '/projects' },
    { name: 'Create Project', path: '/projects/create' },
    { name: 'Project Archive', path: '/archive' },
    { name: 'MMP Management', path: '/mmp' },
    { name: 'Upload MMP', path: '/mmp/upload' },
    { name: 'Site Visits', path: '/site-visits' },
    { name: 'Schedule Site Visit', path: '/site-visits/schedule' },
    { name: 'Site Visit Calendar', path: '/calendar' },
    { name: 'User Management', path: '/users' },
    { name: 'Register User', path: '/register' },
    { name: 'Role Management', path: '/role-management' },
    { name: 'Finance', path: '/finance' },
    { name: 'Reports', path: '/reports' },
    { name: 'Notifications', path: '/notifications' },
    { name: 'Chat', path: '/chat' },
    { name: 'Settings', path: '/settings' },
    { name: 'Wallet', path: '/wallet' },
    { name: 'Field Team', path: '/field-team' },
    { name: 'Data Visibility', path: '/data-visibility' },
    { name: 'Pending Approvals', path: '/users?tab=pending-approvals' },
    { name: 'Approved Users', path: '/users?tab=approved-users' },
    { name: 'Coordinator Dashboard', path: '/coordinator-dashboard' },
    { name: 'Supervisor Dashboard', path: '/supervisor-dashboard' },
    { name: 'Field Operation Manager', path: '/field-operation-manager' },
    // ...add more as your app grows
  ];

  const results = features.filter(f =>
    f.name.toLowerCase().includes(query)
  );

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-4">Search Results</h1>
      <p className="mb-6 text-muted-foreground">Showing results for: <span className="font-semibold">{query}</span></p>
      {results.length > 0 ? (
        <ul className="space-y-3">
          {results.map(f => (
            <li key={f.path}>
              <Link to={f.path} className="text-blue-600 hover:underline text-lg font-medium">
                {f.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-muted-foreground">No features found matching your search.</div>
      )}
    </div>
  );
};

export default GlobalSearchPage;

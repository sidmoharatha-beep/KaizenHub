// Role hierarchy (higher = more access)
export const ROLE_HIERARCHY = {
  'Admin': 6,
  'HR': 5,
  'QC Panel Member': 4,
  'Manager': 3,
  'SIC': 2,
  'Operator': 1
};

// Route -> allowed roles mapping
export const ROUTE_PERMISSIONS = {
  '/api/safety/submit': ['Operator', 'SIC', 'Manager', 'Admin'],
  '/api/safety/review': ['Manager', 'Admin'],
  '/api/quality/submit': ['Operator', 'SIC', 'Manager', 'Admin'],
  '/api/quality/review': ['Manager', 'Admin'],
  '/api/kaizen/submit': ['Operator', 'SIC', 'Manager', 'Admin'],
  '/api/kaizen/screen': ['Manager', 'Admin'],
  '/api/kaizen/approve': ['Manager', 'Admin'],
  '/api/kaizen/implement': ['Operator', 'SIC', 'Manager', 'Admin'],
  '/api/kaizen/evaluate': ['Manager', 'QC Panel Member', 'Admin'],
  '/api/qc/submit': ['Operator', 'SIC', 'Manager', 'Admin'],
  '/api/qc/screen': ['Manager', 'QC Panel Member', 'Admin'],
  '/api/qc/evaluate': ['QC Panel Member', 'Manager', 'Admin'],
  '/api/qc/members': ['Operator', 'SIC', 'Manager', 'Admin'],
  '/api/behavioral/evaluate': ['SIC', 'Manager', 'Admin'],
  '/api/behavioral/approve': ['HR', 'Admin'],
};
  '/api/rewards': ['Operator', 'SIC', 'Manager', 'HR', 'QC Panel Member', 'Admin'],
  '/api/leaderboard': ['Operator', 'SIC', 'Manager', 'HR', 'QC Panel Member', 'Admin'],
  '/api/notifications': ['Operator', 'SIC', 'Manager', 'HR', 'QC Panel Member', 'Admin'],
  '/api/timeline': ['Operator', 'SIC', 'Manager', 'HR', 'QC Panel Member', 'Admin'],
  '/api/learning': ['Operator', 'SIC', 'Manager', 'HR', 'QC Panel Member', 'Admin'],
  '/api/learning/submit': ['Admin'],
  '/api/admin': ['Admin'],
  '/api/users': ['Admin', 'HR'],
  '/api/audit-trail': ['Admin'],
};

export function hasPermission(userRole, path) {
  // Find the most specific matching route
  let matchedRoute = null;
  let matchLength = 0;

  for (const route of Object.keys(ROUTE_PERMISSIONS)) {
    if (path.startsWith(route) && route.length > matchLength) {
      matchedRoute = route;
      matchLength = route.length;
    }
  }

  if (!matchedRoute) return true; // Paths not listed are open to authenticated users
  return ROUTE_PERMISSIONS[matchedRoute].includes(userRole);
}

export function canManageDepartment(user, departmentId) {
  if (['Admin', 'HR'].includes(user.role)) return true;
  return user.department_id === departmentId;
}

export function isAtLeast(userRole, requiredRole) {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

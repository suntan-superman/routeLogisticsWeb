export const ROLE_OPTIONS = [
  { value: 'field_tech', label: 'Field Technician' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Company Administrator' },
];

export const DEFAULT_ROLE = 'field_tech';

export const mapLegacyRoleToValue = (role) => {
  const normalized = (role || '').toLowerCase();
  switch (normalized) {
    case 'technician':
    case 'tech':
    case 'field_tech':
      return 'field_tech';
    case 'manager':
    case 'supervisor':
      return 'supervisor';
    case 'admin':
    case 'company administrator':
      return 'admin';
    default:
      return DEFAULT_ROLE;
  }
};

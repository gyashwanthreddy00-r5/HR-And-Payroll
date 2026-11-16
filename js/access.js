import { sb } from './lib.js';

/** Menu pages a company can rename / reorder / switch off and assign to roles. */
export const PAGES = [
  ['dashboard', 'Dashboard'], ['employees', 'Employees'], ['structures', 'Salary structures'],
  ['leaves', 'Leaves'], ['payroll', 'Run payroll'], ['payslips', 'Payslips'], ['reports', 'Reports'],
];

/** The Settings group: admin only, always on. */
export const SETTINGS_PAGES = [
  ['settings', 'Settings'], ['roles', 'Roles & Permissions'], ['users', 'User Management'],
  ['pages', 'Pages Management'], ['role-pages', 'Role-Page Assignment'],
];

/** Pages where the role can change data (the others are read-only for everyone but admin). */
export const EDITABLE_PAGES = ['employees', 'structures', 'leaves', 'payroll'];

/** What each base role may do with the data; enforced by the database (Row Level Security). */
export const BASE = {
  admin: { name: 'Admin', desc: 'Full access to all pages', canEdit: true,
    data: { employees: 'Edit', salaries: 'Edit', leaves: 'Edit', payroll: 'Run, lock & unlock', payslips: 'All', settings: 'Edit', users: 'Manage' } },
  hr: { name: 'HR', desc: 'Employees, salaries, leaves and running payroll', canEdit: true,
    data: { employees: 'Edit', salaries: 'Edit', leaves: 'Edit', payroll: 'Run & lock', payslips: 'All', settings: 'View', users: '—' } },
  accountant: { name: 'Accountant', desc: 'Views everything, runs & locks payroll, reports', canEdit: false,
    data: { employees: 'View', salaries: 'View', leaves: 'View', payroll: 'Run & lock', payslips: 'All', settings: 'View', users: '—' } },
  employee: { name: 'Employee', desc: 'Own payslips from locked payroll runs only', canEdit: false,
    data: { employees: 'Own', salaries: 'Own', leaves: 'Own', payroll: '—', payslips: 'Own', settings: '—', users: '—' } },
};
export const SYSTEM_KEYS = ['admin', 'hr', 'accountant', 'employee'];

/**
 * Loads the company's roles, pages and role-page grants, merged with defaults.
 * Tables from migrations 006 / 009 that don't exist yet fall back to defaults.
 */
export async function loadAccess(cid) {
  const [p, rp, r] = await Promise.all([
    sb.from('company_pages').select('*').eq('company_id', cid),
    sb.from('company_role_pages').select('*').eq('company_id', cid),
    sb.from('company_roles').select('*').eq('company_id', cid).order('created_at'),
  ]);
  const saved = new Map((p.error ? [] : p.data).map(x => [x.page_key, x]));
  const pages = PAGES.map(([key, label], i) => {
    const x = saved.get(key);
    return { key, label: x?.label || label, defaultLabel: label, sort: x?.sort_order ?? (i + 1) * 10, active: x ? x.active : true };
  }).sort((a, b) => a.sort - b.sort);

  const rows = r.error ? [] : r.data;
  const byKey = new Map(rows.map(x => [x.key, x]));
  const roles = [
    ...SYSTEM_KEYS.map(k => {
      const x = byKey.get(k);
      return { key: k, name: x?.name || BASE[k].name, description: x?.description ?? BASE[k].desc, base: k, system: true, active: true };
    }),
    ...rows.filter(x => !SYSTEM_KEYS.includes(x.key))
      .map(x => ({ key: x.key, name: x.name, description: x.description || '', base: x.base_role, system: false, active: x.active })),
  ];
  const roleOf = key => roles.find(x => x.key === key);

  const grants = new Map();   // `${role}:${page}` -> { view, edit }
  for (const x of (rp.error ? [] : rp.data)) grants.set(`${x.role}:${x.page_key}`, { view: x.can_view, edit: x.can_edit !== false });
  const grant = (roleKey, page) => {
    const role = roleOf(roleKey);
    if (!role || role.base === 'admin') return { view: true, edit: true };
    if (role.base === 'employee') return { view: false, edit: false };
    const g = grants.get(`${roleKey}:${page}`) ?? { view: true, edit: true };
    return { view: g.view, edit: g.view && g.edit && BASE[role.base].canEdit };
  };
  return { pages, roles, roleOf, grant, ready: !p.error && !rp.error, rolesReady: !r.error };
}

/** Pages (menu order) a role may open in this company. */
export function visiblePages(access, roleKey) {
  return access.pages.filter(p => p.active && access.grant(roleKey, p.key).view);
}

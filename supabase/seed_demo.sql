-- Demo company "Acme Infotech Pvt Ltd" for an existing user.
-- Usage: replace :uid with the auth user id, run once. (Payroll runs for Sep/Oct are added by seed_demo_payroll.)
do $$
declare
  uid uuid := ':uid';
  cid uuid;
  s_staff uuid; s_intern uuid; s_sales uuid;
  c_basic uuid; c_hra uuid; c_special uuid; c_inc uuid;
  lt_cl uuid; lt_sl uuid; lt_el uuid; lt_lop uuid;
begin
  if exists (select 1 from companies where name = 'Acme Infotech Pvt Ltd' and created_by = uid) then
    raise notice 'Demo company already exists'; return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  cid := public.create_company('Acme Infotech Pvt Ltd', 'Telangana');

  update companies set
    address = E'Plot 42, Cyber Towers, HITEC City\nHyderabad, Telangana 500081',
    pan = 'AAKCA1234F', tan = 'HYDA12345B', pf_no = 'APHYD0012345000', esi_no = '52000123450001001',
    emp_code_prefix = 'ACM-', setup_step = 6,
    payslip_template = '{"password":"none","footer":"This is a computer-generated payslip and does not require a signature."}'
  where id = cid;

  select id into c_basic from salary_components where company_id = cid and code = 'BASIC';
  select id into c_hra from salary_components where company_id = cid and code = 'HRA';
  select id into c_special from salary_components where company_id = cid and code = 'SPECIAL';
  select id into s_staff from salary_structures where company_id = cid and name = 'Staff';
  select id into s_intern from salary_structures where company_id = cid and name = 'Interns';

  -- Extra components + a sales structure
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,sort_order)
    values (cid,'Sales Incentive','INCENTIVE','earning','fixed',5000,true,3) returning id into c_inc;
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,sort_order)
    values (cid,'Conveyance Allowance','CONV','earning','fixed',1600,false,4);
  insert into salary_structures(company_id,name,description) values (cid,'Sales + Incentive','Sales team: fixed monthly incentive') returning id into s_sales;
  insert into structure_components(company_id,structure_id,component_id,sort_order)
    select cid, s_sales, id, row_number() over (order by sort_order)
    from salary_components where company_id = cid and code in ('BASIC','HRA','INCENTIVE','SPECIAL','PF','ESI','PT','TDS');

  select id into lt_cl from leave_types where company_id = cid and code = 'CL';
  select id into lt_sl from leave_types where company_id = cid and code = 'SL';
  select id into lt_el from leave_types where company_id = cid and code = 'EL';
  select id into lt_lop from leave_types where company_id = cid and code = 'LOP';

  insert into holidays(company_id,date,name) values
    (cid,'2026-01-26','Republic Day'),(cid,'2026-03-04','Holi'),(cid,'2026-08-15','Independence Day'),
    (cid,'2026-10-02','Gandhi Jayanti'),(cid,'2026-10-20','Dussehra'),(cid,'2026-11-24','Guru Nanak Jayanti'),
    (cid,'2026-12-25','Christmas');

  -- Employees
  insert into employees(company_id,emp_code,name,email,phone,gender,dob,doj,department,designation,pan,uan,esi_no,bank_name,bank_acct,ifsc,status) values
    (cid,'ACM-001','Lakshmi Narayana','lakshmi.n@acme.example','9848000001','M','1978-02-14','2019-04-01','Management','Director','AQWPN1234K','100900000001',null,'HDFC Bank','50100000000001','HDFC0001234','active'),
    (cid,'ACM-005','Kavya Rao','kavya.rao@acme.example','9848000005','F','1988-07-22','2020-01-06','HR','HR Manager','BKRPR5678L','100900000005',null,'ICICI Bank','001201500005','ICIC0000012','active'),
    (cid,'ACM-009','Suresh Babu','suresh.b@acme.example','9848000009','M','1985-11-03','2020-08-17','Engineering','Engineering Lead','CSBPB9012M','100900000009',null,'State Bank of India','30000000009','SBIN0020001','active'),
    (cid,'ACM-014','Ravi Kumar','ravi.kumar@acme.example','9848000014','M','1994-05-10','2023-06-12','Engineering','Software Engineer','DRKPK3456N','100900000014',null,'HDFC Bank','50100000000014','HDFC0001234','active'),
    (cid,'ACM-017','Ananya Iyer','ananya.i@acme.example','9848000017','F','1997-09-28','2024-02-01','Engineering','QA Engineer','EAIPI7890P','100900000017',null,'Axis Bank','917010000017','UTIB0000123','active'),
    (cid,'ACM-021','Priya Sharma','priya.sharma@acme.example','9848000021','F','1990-12-01','2021-09-13','Finance','Finance Manager','FPSPS2345Q','100900000021',null,'Kotak Mahindra Bank','5011000021','KKBK0007001','active'),
    (cid,'ACM-025','Vikram Singh','vikram.s@acme.example','9848000025','M','1995-03-17','2024-07-01','Sales','Sales Executive','GVSPS6789R','100900000025',null,'ICICI Bank','001201500025','ICIC0000012','active'),
    (cid,'ACM-029','Divya Menon','divya.m@acme.example','9848000029','F','1999-06-05','2025-01-15','Support','Support Associate','HDMPM0123S','100900000029','5200000000029','State Bank of India','30000000029','SBIN0020001','active'),
    (cid,'ACM-033','Arjun Reddy','arjun.reddy@acme.example','9848000033','M','1992-10-19','2022-03-07','Sales','Key Account Manager','JARPR4567T','100900000033',null,'HDFC Bank','50100000000033','HDFC0001234','active'),
    (cid,'ACM-040','Rahul Verma','rahul.v@acme.example','9848000040','M','1991-01-25','2022-11-01','Engineering','Senior Software Engineer','KRVPV8901U','100900000040',null,'Axis Bank','917010000040','UTIB0000123','active'),
    (cid,'ACM-047','Sneha Patil','sneha.patil@acme.example','9848000047','F','2003-04-11','2026-09-01','Engineering','Engineering Intern',null,null,null,null,null,null,'active'),
    (cid,'ACM-048','Mohammed Irfan','irfan.m@acme.example','9848000048','M','2000-08-30','2026-11-16','Support','Support Associate','LMIPI2345V',null,null,null,null,null,'active');

  -- Salaries (annual CTC = monthly gross × 12)
  insert into employee_salaries(company_id,employee_id,structure_id,annual_ctc,monthly_gross,effective_from,created_by)
  select cid, e.id, s.sid, v.gross * 12, v.gross, v.eff::date, uid
  from (values
    ('ACM-001','Staff',150000,'2026-04-01'),('ACM-005','Staff',55000,'2026-04-01'),('ACM-009','Staff',95000,'2026-04-01'),
    ('ACM-014','Staff',60000,'2026-04-01'),('ACM-017','Staff',48000,'2026-04-01'),('ACM-021','Staff',72500,'2026-04-01'),
    ('ACM-025','Sales + Incentive',38000,'2026-04-01'),('ACM-029','Staff',20000,'2026-04-01'),('ACM-033','Sales + Incentive',45000,'2026-04-01'),
    ('ACM-040','Staff',70000,'2025-04-01'),('ACM-040','Staff',85000,'2026-11-01'),  -- revision effective 1 Nov
    ('ACM-047','Interns',18000,'2026-09-01'),('ACM-048','Staff',32000,'2026-11-16')
  ) as v(code, struct, gross, eff)
  join employees e on e.company_id = cid and e.emp_code = v.code
  join lateral (select id as sid from salary_structures where company_id = cid and name = v.struct) s on true;

  -- Leaves: Sep, Oct, Nov 2026
  insert into leave_entries(company_id,employee_id,date,kind,leave_type_id,half_day,status,note)
  select cid, e.id, v.d::date, v.kind,
         case v.t when 'CL' then lt_cl when 'SL' then lt_sl when 'EL' then lt_el when 'LOP' then lt_lop else null end,
         v.half, 'approved', v.note
  from (values
    -- September
    ('ACM-014','2026-09-14','leave','CL',false,null),
    ('ACM-021','2026-09-21','leave','SL',false,'Fever'),('ACM-021','2026-09-22','leave','SL',false,'Fever'),
    ('ACM-025','2026-09-08','absent',null,false,null),
    ('ACM-029','2026-09-29','leave','LOP',true,'Personal work'),
    ('ACM-033','2026-09-10','leave','EL',false,null),('ACM-033','2026-09-11','leave','EL',false,null),
    -- October
    ('ACM-005','2026-10-12','leave','CL',false,null),
    ('ACM-009','2026-10-26','leave','EL',false,'Family trip'),('ACM-009','2026-10-27','leave','EL',false,'Family trip'),('ACM-009','2026-10-28','leave','EL',false,'Family trip'),
    ('ACM-017','2026-10-15','leave','LOP',false,null),
    ('ACM-025','2026-10-05','leave','SL',false,null),('ACM-025','2026-10-06','leave','LOP',false,null),
    ('ACM-047','2026-10-09','absent',null,false,null),
    -- November (matches the screen: Ravi has 1 CL + 2 days LOP)
    ('ACM-014','2026-11-10','leave','CL',false,null),
    ('ACM-014','2026-11-19','leave','LOP',false,null),('ACM-014','2026-11-20','leave','LOP',false,null),
    ('ACM-017','2026-11-03','leave','SL',false,null),
    ('ACM-021','2026-11-02','leave','CL',true,'Bank work'),
    ('ACM-025','2026-11-12','absent',null,false,null),('ACM-025','2026-11-13','leave','LOP',false,null),
    ('ACM-029','2026-11-05','leave','CL',false,null),
    ('ACM-033','2026-11-17','leave','EL',false,null),('ACM-033','2026-11-18','leave','EL',false,null),
    ('ACM-040','2026-11-26','leave','LOP',true,null),
    ('ACM-047','2026-11-09','leave','LOP',false,null),('ACM-047','2026-11-10','leave','LOP',false,null)
  ) as v(code, d, kind, t, half, note)
  join employees e on e.company_id = cid and e.emp_code = v.code;
end $$;

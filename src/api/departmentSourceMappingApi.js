import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/department-source-mapping`;

export const getStagedDepartments = (params = {}) =>
  axios.get(`${BASE}/staged`, { params }).then(r => r.data);

export const getMasterDepartments = () =>
  axios.get(`${BASE}/masters`).then(r => r.data);

export const bindDepartment = (source_id, source_department_id, master_department_id) =>
  axios.post(`${BASE}/bind`, { source_id, source_department_id, master_department_id }).then(r => r.data);

export const rejectDepartment = (source_id, source_department_id) =>
  axios.post(`${BASE}/reject`, { source_id, source_department_id }).then(r => r.data);

export const resetMapping = (source_id, source_department_id) =>
  axios.delete(`${BASE}/bind/${source_id}/${encodeURIComponent(source_department_id)}`).then(r => r.data);

export const autoBindDepartments = (source_id = null) =>
  axios.post(`${BASE}/auto-bind`, { source_id }).then(r => r.data);

export const createMasterFromSource = (body) =>
  axios.post(`${BASE}/create-master-from-source`, body).then(r => r.data);

export const duplicateCheckDept = (params = {}) =>
  axios.get(`${BASE}/duplicate-check`, { params }).then(r => r.data);

export const bulkFillDeptPreview = (body) =>
  axios.post(`${BASE}/bulk-fill-preview`, body).then(r => r.data);

export const bulkFillDeptApply = (body) =>
  axios.post(`${BASE}/bulk-fill`, body).then(r => r.data);

export const bulkCreateDeptPreview = (body) =>
  axios.post(`${BASE}/bulk-create-preview`, body).then(r => r.data);

export const bulkCreateDeptApply = (body) =>
  axios.post(`${BASE}/bulk-create`, body).then(r => r.data);

export const resolveContext = (body) =>
  axios.post(`${BASE}/resolve-context`, body).then(r => r.data);

export const createDictEntry = (body) =>
  axios.post(`${BASE}/create-dict-entry`, body).then(r => r.data);

export const createStandaloneDept = (body) =>
  axios.post(`${BASE}/create-standalone-dept`, body).then(r => r.data);

export const getDictEntries = (dictType, search = null) =>
  axios.get(`${BASE}/dict-entries`, { params: { dict_type: dictType, ...(search ? { search } : {}) } }).then(r => r.data);

export const suggestMatch = (source_id, source_department_id) =>
  axios.post(`${BASE}/suggest-match`, { source_id, source_department_id }).then(r => r.data);

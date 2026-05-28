import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/brand-source-mapping`;

export const getStagedBrands = (params = {}) =>
  axios.get(`${BASE}/staged`, { params }).then(r => r.data);

export const getMasterBrands = () =>
  axios.get(`${BASE}/masters`).then(r => r.data);

export const bindBrand = (source_id, source_brand_id, master_brand_id) =>
  axios.post(`${BASE}/bind`, { source_id, source_brand_id, master_brand_id }).then(r => r.data);

export const rejectBrand = (source_id, source_brand_id) =>
  axios.post(`${BASE}/reject`, { source_id, source_brand_id }).then(r => r.data);

export const autoBindBrands = (source_id = null) =>
  axios.post(`${BASE}/auto-bind`, { source_id }).then(r => r.data);

export const bulkFillPreview = (body) =>
  axios.post(`${BASE}/bulk-fill-preview`, body).then(r => r.data);

export const bulkFillApply = (body) =>
  axios.post(`${BASE}/bulk-fill`, body).then(r => r.data);

export const bulkCreatePreview = (body) =>
  axios.post(`${BASE}/bulk-create-preview`, body).then(r => r.data);

export const bulkCreateApply = (body) =>
  axios.post(`${BASE}/bulk-create`, body).then(r => r.data);

export const createAndBindBrand = (payload) =>
  axios.post(`${BASE}/create-and-bind`, payload).then(r => r.data);

export const duplicateCheck = (brand_uid = "", brand_name = "") =>
  axios.get(`${BASE}/duplicate-check`, { params: { brand_uid, brand_name } }).then(r => r.data);

export const createMasterFromMapping = (source_id, source_brand_id) =>
  axios.post(`${BASE}/create-master-from-mapping`, { source_id, source_brand_id }).then(r => r.data);

export const unmapBrand = (source_id, source_brand_id) =>
  axios.post(`${BASE}/unmap`, { source_id, source_brand_id }).then(r => r.data);

export const createParentBrand = (source_id, source_brand_id, brand_group = null) =>
  axios.post(`${BASE}/create-parent-brand`, { source_id, source_brand_id, brand_group }).then(r => r.data);

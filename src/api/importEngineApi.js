import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/import-engine`;

export const getImportTypes       = ()              => axios.get(`${BASE}/types`).then(r => r.data);
export const getEngineSources     = ()              => axios.get(`${BASE}/sources`).then(r => r.data);
export const setSourceImportType  = (id, code)      => axios.patch(`${BASE}/sources/${id}/type`, null, { params: { import_type_code: code } }).then(r => r.data);

export const getFieldMapping      = (sourceId)      => axios.get(`${BASE}/field-mapping/${sourceId}`).then(r => r.data);
export const saveFieldMapping     = (sourceId, mappings) => axios.put(`${BASE}/field-mapping/${sourceId}`, { mappings }).then(r => r.data);

export const previewEngineSource  = (sourceId)      => axios.post(`${BASE}/preview/${sourceId}`).then(r => r.data);

export const loadToStaging = (sourceId, params = {}) =>
  axios.post(`${BASE}/load/${sourceId}`, null, { params }).then(r => r.data);

export const getStagingPreview = (batchId, statusFilter = null, limit = 500) =>
  axios.get(`${BASE}/staging/${batchId}`, { params: { status_filter: statusFilter || undefined, limit } }).then(r => r.data);

export const commitBatch = (batchId) =>
  axios.post(`${BASE}/commit/${batchId}`).then(r => r.data);

export const getImportBatches  = (limit = 50) => axios.get(`${BASE}/batches`, { params: { limit } }).then(r => r.data);
export const getBatchDetail    = (batchId)    => axios.get(`${BASE}/batches/${batchId}`).then(r => r.data);
export const deleteBatch       = (batchId, deleteFact = false) =>
  axios.delete(`${BASE}/batches/${batchId}`, { params: { delete_fact: deleteFact } }).then(r => r.data);

export const getFactTurnover = (params = {}) =>
  axios.get(`${BASE}/fact-turnover`, { params }).then(r => r.data);

export const stagingBulkUpdate = (batchId, payload) =>
  axios.post(`${BASE}/staging/${batchId}/bulk-update`, payload).then(r => r.data);

export const rollbackBatch = (batchId) =>
  axios.post(`${BASE}/batches/${batchId}/rollback`).then(r => r.data);

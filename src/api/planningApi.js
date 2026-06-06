import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/planning`;

// ── Scenarios ─────────────────────────────────────────────────────────────────
export const getScenarios     = (params = {}) => axios.get(`${BASE}/scenarios`, { params }).then(r => r.data);
export const createScenario   = (body)        => axios.post(`${BASE}/scenarios`, body).then(r => r.data);
export const getScenario      = (id)          => axios.get(`${BASE}/scenarios/${id}`).then(r => r.data);
export const updateScenario   = (id, body)    => axios.patch(`${BASE}/scenarios/${id}`, body).then(r => r.data);

// ── Versions ──────────────────────────────────────────────────────────────────
export const getVersions   = (scenarioId, params = {}) => axios.get(`${BASE}/scenarios/${scenarioId}/versions`, { params }).then(r => r.data);
export const createVersion = (scenarioId, body)        => axios.post(`${BASE}/scenarios/${scenarioId}/versions`, body).then(r => r.data);
export const getVersion    = (versionId)               => axios.get(`${BASE}/versions/${versionId}`).then(r => r.data);
export const lockVersion   = (versionId)               => axios.post(`${BASE}/versions/${versionId}/lock`).then(r => r.data);

// ── Planning Rules ────────────────────────────────────────────────────────────
export const getRules    = (scenarioId, versionId, params = {}) =>
  axios.get(`${BASE}/rules`, { params: { scenario_id: scenarioId, version_id: versionId, ...params } }).then(r => r.data);

export const createRule  = (scenarioId, versionId, body) =>
  axios.post(`${BASE}/rules`, body, { params: { scenario_id: scenarioId, version_id: versionId } }).then(r => r.data);

export const updateRule  = (ruleId, body) =>
  axios.patch(`${BASE}/rules/${ruleId}`, body).then(r => r.data);

export const deleteRule  = (ruleId) =>
  axios.delete(`${BASE}/rules/${ruleId}`).then(r => r.data);

export const copyRule    = (ruleId) =>
  axios.post(`${BASE}/rules/${ruleId}/copy`).then(r => r.data);

// ── Rule Effects ──────────────────────────────────────────────────────────────
export const createEffect = (ruleId, body) =>
  axios.post(`${BASE}/rules/${ruleId}/effects`, body).then(r => r.data);

export const updateEffect = (effectId, body) =>
  axios.patch(`${BASE}/effects/${effectId}`, body).then(r => r.data);

export const deleteEffect = (effectId) =>
  axios.delete(`${BASE}/effects/${effectId}`).then(r => r.data);

// ── Fact Plan ─────────────────────────────────────────────────────────────────
export const getFactPlan           = (params = {}) => axios.get(`${BASE}/fact-plan`, { params }).then(r => r.data);
export const getFactPlanAggregated = (params = {}) => axios.get(`${BASE}/fact-plan/aggregated`, { params }).then(r => r.data);
export const getFactPlanGrouped    = (params = {}) => axios.get(`${BASE}/fact-plan/grouped`, { params }).then(r => r.data);

// ── Dropdown options — plan table ─────────────────────────────────────────────
export const getPlanDeptOptions = (scenarioId, versionId, search = "", limit = 50) =>
  axios.get(`${BASE}/fact-plan/filter-options/departments`, { params: { scenario_id: scenarioId, version_id: versionId, search, limit } }).then(r => r.data);

export const getPlanPGOptions = (scenarioId, versionId, search = "", limit = 50) =>
  axios.get(`${BASE}/fact-plan/filter-options/product-groups`, { params: { scenario_id: scenarioId, version_id: versionId, search, limit } }).then(r => r.data);

// ── Dimension options — scope builder autocomplete ────────────────────────────
export const getDimOptions = (dimType, search = "", limit = 50) =>
  axios.get(`${BASE}/dim-options/${dimType}`, { params: { search, limit } }).then(r => r.data);

// ── Dropdown options — fact_turnover (for rule scope dropdowns, plan may be empty) ──
export const getTurnoverDeptOptions = (search = "", periodFrom = null, periodTo = null, limit = 50) =>
  axios.get(`${BASE}/fact-plan/filter-options/turnover-departments`, { params: { search, period_from: periodFrom, period_to: periodTo, limit } }).then(r => r.data);

export const getTurnoverPGOptions = (search = "", periodFrom = null, periodTo = null, limit = 50) =>
  axios.get(`${BASE}/fact-plan/filter-options/turnover-product-groups`, { params: { search, period_from: periodFrom, period_to: periodTo, limit } }).then(r => r.data);

// ── Department Mapping Coverage ───────────────────────────────────────────────
export const getDeptMappingCoverage   = (params = {}) => axios.get(`${BASE}/department-mapping-coverage`, { params }).then(r => r.data);
export const getPlanningReadiness     = (params = {}) => axios.get(`${BASE}/planning-readiness`, { params }).then(r => r.data);
export const getPlansOverview         = ()            => axios.get(`${BASE}/plans-overview`).then(r => r.data);
export const quickMapDepartment       = (body)        => axios.post(`${BASE}/quick-map-department`, body).then(r => r.data);
export const deleteVersion            = (versionId)   => axios.delete(`${BASE}/versions/${versionId}`).then(r => r.data);
export const getReadinessProblems     = (params = {}) => axios.get(`${BASE}/readiness-problems`, { params }).then(r => r.data);
export const getBrandMappingCoverage  = (params = {}) => axios.get(`${BASE}/brand-mapping-coverage`, { params }).then(r => r.data);

// ── Generation ────────────────────────────────────────────────────────────────
export const generateFirstDraft  = (body)          => axios.post(`${BASE}/generate-first-draft`, body).then(r => r.data);
export const getGenerationStatus = (generationId)  => axios.get(`${BASE}/status/${generationId}`).then(r => r.data);
export const getGenerationLog    = (params = {})   => axios.get(`${BASE}/generation-log`, { params }).then(r => r.data);

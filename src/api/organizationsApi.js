import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/organizations`;

export async function getOrganizations() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createOrganization(form) {
  const data = new FormData();

  data.append("holding_id", form.holding_id);
  data.append("organization_name", form.organization_name);

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateOrganization(oldOrganizationId, form) {
  const data = new FormData();

  data.append("holding_id", form.holding_id);
  data.append("organization_name", form.organization_name);
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldOrganizationId}`, data);
  return res.data;
}

export async function deactivateOrganization(organizationId) {
  const res = await axios.delete(`${API_URL}/${organizationId}`);
  return res.data;
}

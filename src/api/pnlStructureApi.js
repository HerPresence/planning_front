import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/pnl-structure`;

export async function getPnlStructures() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createPnlStructure(form) {
  const data = new FormData();

  data.append("pnl_code", form.pnl_code);
  data.append("pnl_name", form.pnl_name);
  data.append("pnl_group", form.pnl_group);
  data.append("pnl_order", form.pnl_order);
  data.append("pnl_sign", form.pnl_sign);
  data.append("pnl_parent", form.pnl_parent || 0);
  data.append("is_total", form.is_total ? "true" : "false");

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updatePnlStructure(oldId, form) {
  const data = new FormData();

  data.append("pnl_code", form.pnl_code);
  data.append("pnl_name", form.pnl_name);
  data.append("pnl_group", form.pnl_group);
  data.append("pnl_order", form.pnl_order);
  data.append("pnl_sign", form.pnl_sign);
  data.append("pnl_parent", form.pnl_parent || 0);
  data.append("is_total", form.is_total ? "true" : "false");
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldId}`, data);
  return res.data;
}

export async function deactivatePnlStructure(id) {
  const res = await axios.delete(`${API_URL}/${id}`);
  return res.data;
}
import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/holdings`;

export async function getHoldings() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createHolding(form) {
  const data = new FormData();

  data.append("holding_name", form.holding_name);

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateHolding(oldHoldingId, form) {
  const data = new FormData();

  data.append("holding_name", form.holding_name);
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldHoldingId}`, data);
  return res.data;
}

export async function deactivateHolding(holdingId) {
  const res = await axios.delete(`${API_URL}/${holdingId}`);
  return res.data;
}
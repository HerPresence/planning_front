import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/reference`;

export async function getReferenceDepartments() {
  const res = await axios.get(`${API_URL}/departments`);
  return res.data;
}

export async function getReferenceArticles() {
  const res = await axios.get(`${API_URL}/articles`);
  return res.data;
}

export async function getReferenceSources() {
  try {
    const res = await axios.get(`${API_URL}/sources`);
    return res.data;
  } catch (err) {
    return [];
  }
}

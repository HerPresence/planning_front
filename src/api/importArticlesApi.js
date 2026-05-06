import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/import-articles`;

export async function importArticlesFromSource(sourceId) {
  const res = await axios.post(`${API_URL}/${sourceId}`);
  return res.data;
}
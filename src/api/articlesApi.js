import axios from "axios";

import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/articles`;

export async function getArticles() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createArticle(form) {
  const data = new FormData();

  data.append("article_name", form.article_name);
  data.append("article_type", form.article_type);
  data.append("level1", form.level1);
  data.append("level2", form.level2);
  data.append("pnl_id", form.pnl_id);

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateArticle(oldArticleId, form) {
  const data = new FormData();

  data.append("article_name", form.article_name);
  data.append("article_type", form.article_type);
  data.append("level1", form.level1);
  data.append("level2", form.level2);
  data.append("pnl_id", form.pnl_id);
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldArticleId}`, data);
  return res.data;
}
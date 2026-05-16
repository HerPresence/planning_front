import axios from "axios";

const API_URL = "/api/article-mapping";

export async function getMappings() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createMapping(form) {
  const data = new FormData();

  data.append("source_system", form.source_system);
  data.append("source_article_id", form.source_article_id);
  data.append("source_article_name", form.source_article_name);
  data.append("article_id", form.article_id);
  data.append("comment", form.comment);

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateMapping(mappingId, form) {
  const data = new FormData();

  data.append("source_system", form.source_system);
  data.append("source_article_id", form.source_article_id);
  data.append("source_article_name", form.source_article_name);
  data.append("article_id", form.article_id);
  data.append("comment", form.comment);

  const res = await axios.put(`${API_URL}/${mappingId}`, data);
  return res.data;
}
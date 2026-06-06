import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/articles`;

export async function getArticles(params = {}) {
  const p = { ...params };
  // Strip empty strings so backend doesn't filter on them
  Object.keys(p).forEach(k => { if (p[k] === "" || p[k] === null || p[k] === undefined) delete p[k]; });
  const res = await axios.get(API_URL, { params: p });
  return res.data;
}

export async function getArticleById(articleId) {
  const res = await axios.get(`${API_URL}/${articleId}`);
  return res.data;
}

export async function createArticle(form) {
  const data = new FormData();
  data.append("article_id",          form.article_id);
  data.append("article_name",        form.article_name);
  data.append("article_type",        form.article_type        || "");
  data.append("level1",              form.level1              || "");
  data.append("level2",              form.level2              || "");
  data.append("pnl_id",              Number(form.pnl_id));
  data.append("uid_expense_article", form.uid_expense_article || "");
  data.append("expense_element",     form.expense_element     || "");
  data.append("expense_company",     form.expense_company     || "");
  data.append("level1_olap",         form.level1_olap         || "");
  data.append("level2_olap",         form.level2_olap         || "");
  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function exportCsv(filters = {}, selectedIds = []) {
  const body = { ...filters, selected_ids: selectedIds };
  const res = await axios.post(`${API_URL}/export-csv`, body, { responseType: "blob" });

  // Trigger browser download
  const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `pnl_articles_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function mergePreview(targetArticleId, sourceArticleIds) {
  const res = await axios.post(`${API_URL}/merge-preview`, {
    target_article_id: targetArticleId,
    source_article_ids: sourceArticleIds,
  });
  return res.data;
}

export async function mergeArticles(targetArticleId, sourceArticleIds, reason) {
  const res = await axios.post(`${API_URL}/merge`, {
    target_article_id:  targetArticleId,
    source_article_ids: sourceArticleIds,
    reason:             reason || "",
  });
  return res.data;
}

export async function bulkFillPreview(body) {
  const res = await axios.post(`${API_URL}/bulk-fill-preview`, body);
  return res.data;
}

export async function bulkFill(body) {
  const res = await axios.post(`${API_URL}/bulk-fill`, body);
  return res.data;
}

export async function updateArticle(oldArticleId, form) {
  const data = new FormData();
  data.append("article_name",        form.article_name);
  data.append("article_type",        form.article_type        || "");
  data.append("level1",              form.level1              || "");
  data.append("level2",              form.level2              || "");
  data.append("pnl_id",              form.pnl_id);
  data.append("is_active",           form.is_active ? "true" : "false");
  data.append("uid_expense_article", form.uid_expense_article || "");
  data.append("expense_element",     form.expense_element     || "");
  data.append("expense_company",     form.expense_company     || "");
  data.append("level1_olap",         form.level1_olap         || "");
  data.append("level2_olap",         form.level2_olap         || "");
  const res = await axios.put(`${API_URL}/${oldArticleId}`, data);
  return res.data;
}

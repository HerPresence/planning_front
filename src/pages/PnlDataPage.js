import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getPlanPnL,
  createPlanPnL,
  updatePlanPnL,
  deletePlanPnL,
  getFactPnL,
  createFactPnL,
  updateFactPnL,
  deleteFactPnL,
} from "../api/pnlDataApi";

import {
  getReferenceDepartments,
  getReferenceArticles,
  getReferenceSources,
} from "../api/referenceApi";

function PnlDataPage({ setActivePage }) {
  const [activeTab, setActiveTab] = useState("plan");

  const [planData, setPlanData] = useState([]);
  const [factData, setFactData] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [articles, setArticles] = useState([]);
  const [sources, setSources] = useState([]);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const emptyPlanForm = {
    period: "",
    holding_name: "",
    organization_name: "",
    region_name: "",
    branch_name: "",
    department_id: "",
    department_name: "",
    article_id: "",
    article_name: "",
    pnl_id: "",
    scenario: "",
    version_name: "",
    amount: "",
    comment: "",
  };

  const emptyFactForm = {
    period: "",
    holding_name: "",
    organization_name: "",
    region_name: "",
    branch_name: "",
    department_id: "",
    department_name: "",
    article_id: "",
    article_name: "",
    pnl_id: "",
    amount: "",
    registrar: "",
    source_name: "",
  };

  const [form, setForm] = useState(emptyPlanForm);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, factRes, deptRes, artRes, srcRes] = await Promise.all([
        getPlanPnL(),
        getFactPnL(),
        getReferenceDepartments(),
        getReferenceArticles(),
        getReferenceSources(),
      ]);
      setPlanData(planRes);
      setFactData(factRes);
      setDepartments(deptRes);
      setArticles(artRes);
      setSources(srcRes);
    } catch (err) {
      console.error("Помилка завантаження даних:", err);
      setError("Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditId(null);
    setForm(activeTab === "plan" ? emptyPlanForm : emptyFactForm);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditId(activeTab === "plan" ? item.plan_id : item.fact_id);
    setForm({ ...item });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({
      ...form,
      [name]: value,
    });
  };

  const handleDepartmentChange = (e) => {
    const depId = e.target.value;
    const selected = departments.find((d) => d.department_id === depId);

    if (selected) {
      setForm({
        ...form,
        department_id: selected.department_id,
        department_name: selected.department_name,
        holding_name: selected.holding_name,
        organization_name: selected.organization_name,
        region_name: selected.region_name,
        branch_name: selected.branch_name,
      });
    }
  };

  const handleArticleChange = (e) => {
    const artId = e.target.value;
    const selected = articles.find((a) => a.article_id === artId);

    if (selected) {
      setForm({
        ...form,
        article_id: selected.article_id,
        article_name: selected.article_name,
        pnl_id: selected.pnl_id,
      });
    }
  };

  const saveItem = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (activeTab === "plan") {
        if (editId) {
          await updatePlanPnL(editId, form);
        } else {
          await createPlanPnL(form);
        }
      } else {
        if (editId) {
          await updateFactPnL(editId, form);
        } else {
          await createFactPnL(form);
        }
      }

      setShowModal(false);
      setEditId(null);
      setForm(activeTab === "plan" ? emptyPlanForm : emptyFactForm);
      await loadAllData();
    } catch (err) {
      console.error("Помилка збереження:", err);
      setError("Помилка збереження даних");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item) => {
    const id = activeTab === "plan" ? item.plan_id : item.fact_id;
    const confirmed = window.confirm(
      `Видалити запис ID: ${id}?`
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (activeTab === "plan") {
        await deletePlanPnL(id);
      } else {
        await deleteFactPnL(id);
      }
      await loadAllData();
    } catch (err) {
      console.error("Помилка видалення:", err);
      setError(err.response?.data?.detail || "Помилка видалення");
    } finally {
      setLoading(false);
    }
  };

  const currentData = activeTab === "plan" ? planData : factData;

  const filteredData = currentData.filter((item) => {
    const searchStr = `
      ${item.period || ""}
      ${item.holding_name || ""}
      ${item.organization_name || ""}
      ${item.region_name || ""}
      ${item.branch_name || ""}
      ${item.department_name || ""}
      ${item.article_name || ""}
      ${item.pnl_id || ""}
      ${item.amount || ""}
    `
      .toLowerCase();

    return searchStr.includes(search.toLowerCase());
  });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setEditId(null);
    setForm(tab === "plan" ? emptyPlanForm : emptyFactForm);
  };

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>План / Факт PnL</h2>
            <p>Керування плановими та фактичними даними PnL.</p>
          </div>

          <div className="tabs-header">
            <button
              className={`tab-btn ${activeTab === "plan" ? "active" : ""}`}
              onClick={() => handleTabChange("plan")}
            >
              📋 План PnL
            </button>
            <button
              className={`tab-btn ${activeTab === "fact" ? "active" : ""}`}
              onClick={() => handleTabChange("fact")}
            >
              📊 Факт PnL
            </button>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder={`Пошук ${activeTab === "plan" ? "плану" : "факту"}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати
            </Button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Завантаження...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Період</th>
                <th>Холдинг</th>
                <th>Організація</th>
                <th>Регіон</th>
                <th>Філія</th>
                <th>Підрозділ</th>
                <th>Стаття</th>
                <th>PnL</th>
                {activeTab === "plan" && <th>Сценарій</th>}
                {activeTab === "plan" && <th>Версія</th>}
                <th>Сума</th>
                {activeTab === "fact" && <th>Реєстратор</th>}
                {activeTab === "fact" && <th>Джерело</th>}
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="100%" className="empty-row">
                    Немає даних
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => (
                  <tr key={activeTab === "plan" ? item.plan_id : item.fact_id}>
                    <td>{activeTab === "plan" ? item.plan_id : item.fact_id}</td>
                    <td>{item.period}</td>
                    <td>{item.holding_name}</td>
                    <td>{item.organization_name}</td>
                    <td>{item.region_name}</td>
                    <td>{item.branch_name}</td>
                    <td>{item.department_name}</td>
                    <td>{item.article_name}</td>
                    <td>{item.pnl_id}</td>
                    {activeTab === "plan" && <td>{item.scenario}</td>}
                    {activeTab === "plan" && <td>{item.version_name}</td>}
                    <td className="amount-cell">{parseFloat(item.amount).toFixed(2)}</td>
                    {activeTab === "fact" && <td>{item.registrar}</td>}
                    {activeTab === "fact" && <td>{item.source_name}</td>}
                    <td className="actions-cell">
                      <Button
                        variant="secondary"
                        onClick={() => openEditModal(item)}
                      >
                        Редагувати
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(item)}
                      >
                        Видалити
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>

      {showModal && (
        <Modal
          title={editId ? `Редагування запису` : `Додавання нового запису`}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveItem}>
            <div className="form-row">
              <input
                type="date"
                name="period"
                value={form.period}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-row">
              <select
                name="department_id"
                value={form.department_id}
                onChange={handleDepartmentChange}
                required
                disabled={loading}
              >
                <option value="">Вибрати підрозділ *</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.department_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <select
                name="article_id"
                value={form.article_id}
                onChange={handleArticleChange}
                required
                disabled={loading}
              >
                <option value="">Вибрати статтю *</option>
                {articles.map((a) => (
                  <option key={a.article_id} value={a.article_id}>
                    {a.article_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <input
                type="number"
                name="amount"
                placeholder="Сума *"
                value={form.amount}
                onChange={handleChange}
                step="0.01"
                required
              />
            </div>

            {activeTab === "plan" && (
              <>
                <div className="form-row">
                  <select
                    name="scenario"
                    value={form.scenario}
                    onChange={handleChange}
                  >
                    <option value="">Сценарій</option>
                    <option value="План">План</option>
                    <option value="Прогноз">Прогноз</option>
                    <option value="Факт">Факт</option>
                    <option value="Коригування">Коригування</option>
                  </select>
                </div>
                <div className="form-row">
                  <select
                    name="version_name"
                    value={form.version_name}
                    onChange={handleChange}
                  >
                    <option value="">Версія</option>
                    <option value="Базова">Базова</option>
                    <option value="V1">V1</option>
                    <option value="V2">V2</option>
                  </select>
                </div>
                <div className="form-row">
                  <input
                    type="text"
                    name="comment"
                    placeholder="Коментар"
                    value={form.comment}
                    onChange={handleChange}
                  />
                </div>
              </>
            )}

            {activeTab === "fact" && (
              <>
                <div className="form-row">
                  <input
                    type="text"
                    name="registrar"
                    placeholder="Реєстратор"
                    value={form.registrar}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-row">
                  <input
                    type="text"
                    name="source_name"
                    placeholder="Джерело"
                    value={form.source_name}
                    onChange={handleChange}
                  />
                </div>
              </>
            )}

            <div className="modal-actions">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Збереження..." : "Зберегти"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Скасувати
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <style>{`
        .tabs-header {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 1px solid #ddd;
        }

        .tab-btn {
          padding: 10px 20px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          transition: all 0.3s ease;
        }

        .tab-btn:hover {
          color: #2c3e50;
          border-bottom-color: #e0e0e0;
        }

        .tab-btn.active {
          color: #3498db;
          border-bottom-color: #3498db;
        }

        .error-message {
          padding: 12px;
          background-color: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c33;
          margin-bottom: 15px;
          font-size: 14px;
        }

        .loading {
          padding: 20px;
          text-align: center;
          color: #666;
        }

        .empty-row {
          text-align: center;
          color: #999;
          padding: 20px !important;
        }

        .amount-cell {
          text-align: right;
          font-weight: 500;
        }

        .form-row {
          display: flex;
          gap: 10px;
          margin-bottom: 12px;
          min-width: 0;
        }

        .form-row input,
        .form-row select {
          flex: 1 1 0;
          min-width: 0;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-row input:focus,
        .form-row select:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 4px rgba(52, 152, 219, 0.2);
        }

        .form-row select:disabled {
          background-color: #f5f5f5;
          color: #999;
          cursor: not-allowed;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 20px;
        }
      `}</style>
    </>
  );
}

export default PnlDataPage;

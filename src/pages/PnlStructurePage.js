import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getPnlStructures,
  createPnlStructure,
  updatePnlStructure,
  deactivatePnlStructure,
} from "../api/pnlStructureApi";

const PNL_GROUP_OPTIONS = [
  "Revenue",
  "COGS",
  "GrossProfit",
  "OPEX",
  "EBITDA",
  "DA",
  "EBIT",
  "Finance",
  "EBT",
  "Tax",
  "NetProfit",
];

const SUBTOTAL_GROUPS = ["EBITDA", "EBIT", "EBT", "NetProfit"];

function PnlStructurePage({ setActivePage }) {
  const { canEdit } = usePagePermission("pnlStructure");

  const [pnlStructures, setPnlStructures] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const emptyForm = {
    pnl_code: "",
    pnl_name: "",
    pnl_group: "",
    pnl_order: 0,
    pnl_sign: 1,
    pnl_parent: "",
    is_total: false,
    is_active: true,
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadPnlStructures();
  }, []);

  const loadPnlStructures = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getPnlStructures();
      setPnlStructures(data);
    } catch (err) {
      console.error("Помилка завантаження структури PnL:", err);
      setError("Помилка завантаження структури PnL");
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
    setError("");
    setSuccess("");
  };

  const openEditModal = (item) => {
    setEditId(item.id);
    setForm({
      pnl_code: item.pnl_code || "",
      pnl_name: item.pnl_name || "",
      pnl_group: item.pnl_group || "",
      pnl_order: item.pnl_order ?? 0,
      pnl_sign: item.pnl_sign ?? 1,
      pnl_parent: item.pnl_parent || "",
      is_total: item.is_total ?? false,
      is_active: item.is_active ?? true,
    });
    setShowModal(true);
    setError("");
    setSuccess("");
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]:
        type === "checkbox"
          ? checked
          : name === "pnl_sign" || type === "number"
          ? parseInt(value, 10) || 0
          : value,
    });
  };

  const buildTree = (items) => {
    const nodes = items.map((item) => ({ ...item, children: [] }));
    const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
    const roots = [];

    nodes.forEach((node) => {
      const parentId = node.pnl_parent || null;
      if (parentId && nodeMap[parentId] && parentId !== node.id) {
        nodeMap[parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (a, b) => {
      const orderA = a.pnl_order ?? 0;
      const orderB = b.pnl_order ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.pnl_name || "").localeCompare(b.pnl_name || "");
    };

    const result = [];

    const traverse = (node, level) => {
      result.push({ ...node, treeLevel: level });
      node.children.sort(sortNodes).forEach((child) => traverse(child, level + 1));
    };

    roots.sort(sortNodes).forEach((root) => traverse(root, 1));
    return result;
  };

  const treeData = buildTree(pnlStructures);

  const getParentName = (parentId) => {
    if (!parentId) return "";
    const parent = pnlStructures.find((p) => p.id === parentId);
    return parent ? parent.pnl_name : "";
  };

  const isSubtotalGroup = (group) => SUBTOTAL_GROUPS.includes(group);

  const filteredStructures = treeData.filter((item) =>
    `${item.pnl_code} ${item.pnl_name} ${item.pnl_group} ${getParentName(item.pnl_parent)} ${item.pnl_sign} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const parentOptions = pnlStructures
    .filter((item) => item.id !== editId)
    .sort((a, b) => (a.pnl_order ?? 0) - (b.pnl_order ?? 0));

  const savePnlStructure = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (editId) {
        await updatePnlStructure(editId, form);
        setSuccess("Структура PnL успішно оновлена");
      } else {
        await createPnlStructure(form);
        setSuccess("Структура PnL успішно додана");
      }

      setShowModal(false);
      setEditId(null);
      setForm(emptyForm);
      await loadPnlStructures();
    } catch (err) {
      console.error("Помилка збереження структури PnL:", err);
      setError("Помилка збереження структури PnL");
    }
  };

  const handleDeactivate = async (item) => {
    const confirmed = window.confirm(
      `Деактивувати структуру PnL "${item.pnl_name}"?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await deactivatePnlStructure(item.id);
      setSuccess("Структура PnL успішно деактивована");
      await loadPnlStructures();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      setError("Помилка деактивації структури PnL");
    }
  };

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Структура PnL</h2>
            <p>Довідник структури PnL для системи планування.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук структури PnL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати рядок
            </Button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {loading ? (
          <div className="loading">Завантаження...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Код</th>
                <th>Назва</th>
                <th>Група</th>
                <th>Знак</th>
                <th>Порядок</th>
                <th>Рівень</th>
                <th>Батьківський</th>
                <th>Ітого</th>
                <th>Активний</th>
                <th>Дії</th>
              </tr>
            </thead>

            <tbody>
              {filteredStructures.length === 0 && (
                <tr>
                  <td colSpan="11" className="empty-row">
                    Структури PnL поки немає або нічого не знайдено.
                  </td>
                </tr>
              )}

              {filteredStructures.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.pnl_code}</td>
                  <td style={{ paddingLeft: `${Math.max(0, (item.treeLevel - 1) * 18)}px` }}>
                    {item.pnl_name}
                  </td>
                  <td>{item.pnl_group}</td>
                  <td>{item.pnl_sign}</td>
                  <td>{item.pnl_order}</td>
                  <td>{item.pnl_level}</td>
                  <td>{getParentName(item.pnl_parent)}</td>
                  <td>
                    <span className={item.is_total ? "status total" : "status normal"}>
                      {item.is_total ? "Ітого" : "Звичайний"}
                    </span>
                  </td>
                  <td>
                    <span className={item.is_active ? "status active" : "status inactive"}>
                      {item.is_active ? "Активний" : "Неактивний"}
                    </span>
                  </td>
                  <td>
                    {canEdit && <button className="icon-btn edit" onClick={() => openEditModal(item)}>✎</button>}
                    {canEdit && <button className="icon-btn delete" onClick={() => handleDeactivate(item)}>×</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showModal && (
        <Modal
          title={editId ? "Редагувати структуру PnL" : "Додати структуру PnL"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={savePnlStructure}>
            <div className="form-grid">
              <div className="form-field">
                <label>Код PnL</label>
                <input
                  name="pnl_code"
                  value={form.pnl_code}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field full">
                <label>Назва PnL *</label>
                <input
                  name="pnl_name"
                  value={form.pnl_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Група</label>
                <select name="pnl_group" value={form.pnl_group} onChange={handleChange}>
                  <option value="">Оберіть групу</option>
                  {PNL_GROUP_OPTIONS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Знак</label>
                <select name="pnl_sign" value={form.pnl_sign} onChange={handleChange}>
                  <option value={1}>1</option>
                  <option value={-1}>-1</option>
                </select>
              </div>

              <div className="form-field">
                <label>Порядок</label>
                <input
                  name="pnl_order"
                  type="number"
                  value={form.pnl_order}
                  onChange={handleChange}
                  min="0"
                />
              </div>

              <div className="form-field full">
                <label>Батьківський</label>
                <select name="pnl_parent" value={form.pnl_parent} onChange={handleChange}>
                  <option value="">Оберіть батьківський рядок</option>
                  {parentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} - {item.pnl_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field full">
                <label>Рівень</label>
                <input value={form.pnl_parent ? pnlStructures.find((p) => p.id === Number(form.pnl_parent))?.pnl_level + 1 || 1 : 1} disabled />
              </div>

              <div className="form-field checkbox-field">
                <label>
                  <input
                    name="is_total"
                    type="checkbox"
                    checked={form.is_total}
                    onChange={handleChange}
                  />
                  Ітого
                </label>
              </div>

              {editId && (
                <div className="form-field checkbox-field">
                  <label>
                    <input
                      name="is_active"
                      type="checkbox"
                      checked={form.is_active}
                      onChange={handleChange}
                    />
                    Активний
                  </label>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Скасувати
              </Button>
              <Button variant="primary" type="submit">
                Зберегти
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default PnlStructurePage;

import React from "react";
import Pagination from "../ui/Pagination";

// Thin wrapper around Pagination for table context.
// Accepts same props as Pagination: page, pageSize, total, onChange.
function TablePagination({ page, pageSize, total, onChange }) {
  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      onChange={onChange}
    />
  );
}

export default TablePagination;

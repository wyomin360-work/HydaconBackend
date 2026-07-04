const videoPaths = {
  root: "/videos",
  create: "/",
  list: "/list",
  details: "/:id",
  update: "/:id",
  delete: "/:id",
  toggleStatus: "/:id/status",
  metrics: "/:id/metrics",
  featured: "/featured",
  counts: "/counts",
  softDelete: "/:id/soft-delete",
  restore: "/:id/restore",
};

module.exports = videoPaths;

const videoPaths = {
  root: "/videos",
  create: "/",
  list: "/list",
  details: "/:id",
  update: "/:id",
  delete: "/:id",
  toggleStatus: "/:id/status",
  metrics: "/:id/metrics",
  analytics: "/:id/analytics",
  featured: "/featured",
  counts: "/counts",
  softDelete: "/:id/soft-delete",
  restore: "/:id/restore",
  publicList: "/public/list",
  publicDetails: "/public/:id",
  publicMetrics: "/public/:id/metrics",
};

module.exports = videoPaths;

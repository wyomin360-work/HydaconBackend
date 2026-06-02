module.exports = {
  root: "/loyalty",
  summary: "/summary",
  admin: {
    tiers: "/admin/tiers",
    tiersDetail: "/admin/tiers/:id",
    seasons: "/admin/seasons",
    seasonsDetail: "/admin/seasons/:id",
    seasonsActivate: "/admin/seasons/:id/activate",
    seasonsDeactivate: "/admin/seasons/:id/deactivate",
    seasonSummary: "/admin/season-summary",
    tierConfigurations: "/admin/tier-configurations",
    tierConfigurationsDetail: "/admin/tier-configurations/:id",
    tierConfigurationHistory: "/admin/tier-configurations/:id/history",
    configAuditLogs: "/admin/config-audit-logs",
    benefits: "/admin/benefits",
    benefitsDetail: "/admin/benefits/:id",
  },
};

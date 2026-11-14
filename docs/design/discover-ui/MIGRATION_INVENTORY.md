# Migration inventory

Every file under `src/pages` and `src/components` with legacy styling, ordered in-scope first by effort. Scope `out` = do not restyle (see BUILD_BRIEF.md §0.10). Tick **Done** in the PR that migrates the file. Re-generate the counts at the end of each wave with the greps in BUILD_BRIEF.md §9.

Columns: inline React style objects; `.btn` class uses; `xp-*` classes; `admin-card` / `panel-section` / `admin-table`; imports `@mantine/core`; hex colour literals; emoji used as status icons.

Generated 2026-11-14 from src/. In-scope totals: inline styles 1933, .btn 271, xp-* 183, legacy containers/tables 217, hex colours 524, emoji 9, files importing Mantine 15.

| Scope | File | Inline styles | .btn | xp-* | admin-card / panel-section / admin-table | Mantine | Hex | Emoji | Done |
|---|---|---|---|---|---|---|---|---|---|
| in | `src/pages/admin/AdminMapDashboard.jsx` | 178 | 28 | 0 | 50 |  | 123 | 0 | [ ] |
| in | `src/pages/client/ClientMapDashboard.jsx` | 161 | 28 | 0 | 54 |  | 125 | 0 | [ ] |
| in | `src/components/experience/LookAndFeelPage.jsx` | 47 | 13 | 90 | 0 |  | 6 | 0 | [ ] |
| in | `src/pages/client/ClientMapData.jsx` | 133 | 2 | 0 | 11 | yes | 23 | 3 | [ ] |
| in | `src/components/FilterFieldsPanel.jsx` | 66 | 17 | 0 | 15 |  | 11 | 0 | [ ] |
| in | `src/pages/admin/AdminMapData.jsx` | 123 | 0 | 0 | 11 | yes | 21 | 3 | [ ] |
| in | `src/components/directories/DirectoryClaimsPanel.jsx` | 93 | 12 | 0 | 6 |  | 8 | 0 | [ ] |
| in | `src/components/experience/EntryPagesPage.jsx` | 20 | 4 | 44 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/experience/ui.jsx` | 10 | 5 | 35 | 0 |  | 5 | 0 | [ ] |
| in | `src/components/directories/CategorisationsPanel.jsx` | 49 | 11 | 0 | 10 |  | 10 | 0 | [ ] |
| in | `src/components/directories/DirectoryEntriesPanel.jsx` | 52 | 5 | 0 | 7 | yes | 8 | 0 | [ ] |
| in | `src/pages/admin/AdminClientDetail.jsx` | 47 | 6 | 0 | 3 |  | 6 | 0 | [ ] |
| in | `src/components/experience/GradientBackgroundField.jsx` | 11 | 2 | 14 | 0 |  | 4 | 0 | [ ] |
| in | `src/pages/client/ClientTeam.jsx` | 26 | 4 | 0 | 1 |  | 8 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectorySettingsGeneralRoute.jsx` | 14 | 5 | 0 | 3 |  | 9 | 0 | [ ] |
| in | `src/pages/client/ClientLayout.jsx` | 11 | 6 | 0 | 4 |  | 3 | 0 | [ ] |
| in | `src/components/directories/DirectoryAiContentPanel.jsx` | 22 | 3 | 0 | 3 |  | 8 | 1 | [ ] |
| in | `src/components/directories/CategorisationAttachmentPicker.jsx` | 14 | 6 | 0 | 2 |  | 1 | 0 | [ ] |
| in | `src/components/directories/MediaAssetsEditor.jsx` | 25 | 4 | 0 | 0 |  | 4 | 0 | [ ] |
| in | `src/components/directories/entryEdit/EntryBasicInfoTab.jsx` | 19 | 2 | 0 | 1 | yes | 4 | 0 | [ ] |
| in | `src/pages/admin/AdminSyncLog.jsx` | 35 | 0 | 0 | 0 | yes | 0 | 0 | [ ] |
| in | `src/components/MessagingProfileEditor.jsx` | 0 | 9 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directories/BulkCategoryEditModal.jsx` | 30 | 2 | 0 | 1 |  | 1 | 0 | [ ] |
| in | `src/components/directories/TeamMembersEditor.jsx` | 20 | 4 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/components/directories/ClaimBannerSettings.jsx` | 31 | 1 | 0 | 0 |  | 5 | 0 | [ ] |
| in | `src/components/directories/DirectoryContentPagesPanel.jsx` | 16 | 0 | 0 | 3 | yes | 5 | 0 | [ ] |
| in | `src/components/directories/DirectoryEmailTemplatesEditor.jsx` | 17 | 3 | 0 | 1 |  | 4 | 0 | [ ] |
| in | `src/components/directories/AccreditationSchemesPanel.jsx` | 16 | 4 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/components/SyncHistoryTable.jsx` | 28 | 0 | 0 | 0 | yes | 0 | 0 | [ ] |
| in | `src/components/directories/DirectoryPublishPanel.jsx` | 18 | 3 | 0 | 0 |  | 3 | 1 | [ ] |
| in | `src/components/directories/ProminentLinksEditor.jsx` | 18 | 3 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/components/directories/EvidenceItemsEditor.jsx` | 18 | 3 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/pages/admin/AdminUserActivity.jsx` | 15 | 3 | 0 | 1 |  | 2 | 0 | [ ] |
| in | `src/pages/admin/AdminClients.jsx` | 4 | 5 | 0 | 2 |  | 0 | 0 | [ ] |
| in | `src/components/directories/ProductTilesEditor.jsx` | 17 | 3 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/pages/client/ClientUsers.jsx` | 19 | 1 | 0 | 3 |  | 1 | 0 | [ ] |
| in | `src/components/integrations/AiProvidersTab.jsx` | 4 | 6 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/admin/AdminErrorLogs.jsx` | 15 | 2 | 0 | 1 |  | 4 | 0 | [ ] |
| in | `src/pages/client/ClientMapNew.jsx` | 17 | 3 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/BulkFilterEditModal.jsx` | 18 | 2 | 0 | 1 |  | 1 | 0 | [ ] |
| in | `src/components/directories/DirectorySeoSettingsPanel.jsx` | 15 | 1 | 0 | 0 | yes | 2 | 0 | [ ] |
| in | `src/components/directories/entryEdit/EntryPanelTab.jsx` | 7 | 0 | 0 | 2 | yes | 9 | 0 | [ ] |
| in | `src/pages/admin/AdminMapListings.jsx` | 12 | 3 | 0 | 1 |  | 1 | 0 | [ ] |
| in | `src/pages/admin/AdminMapNew.jsx` | 15 | 3 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directories/DirectoriesDashboard.jsx` | 16 | 2 | 0 | 1 |  | 0 | 0 | [ ] |
| in | `src/pages/admin/AdminMaps.jsx` | 8 | 3 | 0 | 1 |  | 0 | 0 | [ ] |
| in | `src/components/AdminGate.jsx` | 23 | 0 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/components/directories/DirectoryEnquiryPanel.jsx` | 20 | 0 | 0 | 1 |  | 3 | 0 | [ ] |
| in | `src/components/directories/entryEdit/EntryPreviewPublishTab.jsx` | 7 | 0 | 0 | 2 | yes | 3 | 0 | [ ] |
| in | `src/components/directories/entryEdit/EntrySeoTab.jsx` | 10 | 0 | 0 | 2 | yes | 0 | 0 | [ ] |
| in | `src/components/directories/entryEdit/EntryContentTab.jsx` | 7 | 1 | 0 | 1 | yes | 0 | 0 | [ ] |
| in | `src/pages/admin/AdminEditListing.jsx` | 21 | 0 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/pages/client/ClientMapListings.jsx` | 10 | 2 | 0 | 1 |  | 1 | 0 | [ ] |
| in | `src/components/integrations/AiFeaturesConfig.jsx` | 9 | 3 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/admin/AdminDeployments.jsx` | 7 | 2 | 0 | 0 |  | 4 | 0 | [ ] |
| in | `src/components/MessagingProfiles.jsx` | 0 | 4 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directories/DirectoryAiSearchPanel.jsx` | 12 | 1 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/components/directories/CategoryTagPicker.jsx` | 14 | 0 | 0 | 0 |  | 6 | 0 | [ ] |
| in | `src/pages/admin/AdminDirectories.jsx` | 6 | 2 | 0 | 1 |  | 0 | 0 | [ ] |
| in | `src/pages/admin/AdminContactDetail.jsx` | 14 | 1 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/admin/EntitlementsPanel.jsx` | 14 | 0 | 0 | 1 |  | 2 | 0 | [ ] |
| in | `src/components/directories/DirectoryAiSeoMetadataPanel.jsx` | 10 | 1 | 0 | 0 |  | 3 | 1 | [ ] |
| in | `src/pages/admin/AdminLeads.jsx` | 6 | 1 | 0 | 1 |  | 3 | 0 | [ ] |
| in | `src/pages/admin/AdminListings.jsx` | 4 | 2 | 0 | 1 |  | 0 | 0 | [ ] |
| in | `src/pages/client/ClientDirectoryNew.jsx` | 7 | 2 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directories/entryEdit/EntryCategoriesTab.jsx` | 3 | 0 | 0 | 1 | yes | 1 | 0 | [ ] |
| in | `src/pages/admin/AdminUserDetail.jsx` | 9 | 0 | 0 | 2 |  | 1 | 0 | [ ] |
| in | `src/components/directories/DirectorySearchSettingsPanel.jsx` | 9 | 1 | 0 | 0 |  | 2 | 0 | [ ] |
| in | `src/pages/admin/AdminDirectoryNew.jsx` | 5 | 2 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/admin/AdminClientNew.jsx` | 5 | 2 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectoryOverviewRoute.jsx` | 12 | 0 | 0 | 1 |  | 0 | 0 | [ ] |
| in | `src/components/ai/DraftingPromptModal.jsx` | 0 | 1 | 0 | 0 | yes | 0 | 0 | [ ] |
| in | `src/components/directories/DirectoryAnalyticsPanel.jsx` | 8 | 1 | 0 | 0 |  | 2 | 0 | [ ] |
| in | `src/pages/client/ClientDashboard.jsx` | 4 | 0 | 0 | 0 | yes | 0 | 0 | [ ] |
| in | `src/components/ListingFilterValuesEditor.jsx` | 13 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directories/DirectoryGeneralSettingsPanel.jsx` | 6 | 1 | 0 | 0 |  | 2 | 0 | [ ] |
| in | `src/pages/client/MapsView.jsx` | 5 | 0 | 0 | 0 |  | 6 | 0 | [ ] |
| in | `src/components/DomainSettings.jsx` | 0 | 2 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/MessagingSentMessages.jsx` | 0 | 2 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/ai/AiBulkRunReport.jsx` | 4 | 1 | 0 | 0 |  | 1 | 0 | [ ] |
| in | `src/components/ErrorBoundary.jsx` | 4 | 0 | 0 | 0 |  | 5 | 0 | [ ] |
| in | `src/components/EntitlementGate.jsx` | 6 | 0 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/components/admin/EntitlementLimitModal.jsx` | 3 | 1 | 0 | 0 |  | 1 | 0 | [ ] |
| in | `src/components/integrations/AiUsageTab.jsx` | 7 | 0 | 0 | 0 |  | 2 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectoryAnalyticsRoute.jsx` | 5 | 0 | 0 | 1 |  | 0 | 0 | [ ] |
| in | `src/components/directories/entryEdit/RichTextEditor.jsx` | 4 | 0 | 0 | 0 |  | 4 | 0 | [ ] |
| in | `src/pages/admin/AdminUsers.jsx` | 3 | 0 | 0 | 1 |  | 1 | 0 | [ ] |
| in | `src/pages/admin/AdminLayout.jsx` | 6 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/client/ClientHome.jsx` | 3 | 0 | 0 | 1 |  | 0 | 0 | [ ] |
| in | `src/pages/client/ListingStats.jsx` | 1 | 1 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/shell/WorkspaceSwitcher.jsx` | 6 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/engagement/EngagementCharts.jsx` | 0 | 0 | 0 | 0 |  | 6 | 0 | [ ] |
| in | `src/components/directories/DirectoryEntryEditor.jsx` | 5 | 0 | 0 | 0 |  | 1 | 0 | [ ] |
| in | `src/components/directories/entryEdit/EntryEditSubNav.jsx` | 3 | 0 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/pages/client/MapStats.jsx` | 0 | 1 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/EntityMessagingSettings.jsx` | 0 | 1 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/MapTileThumb.jsx` | 3 | 0 | 0 | 0 |  | 2 | 0 | [ ] |
| in | `src/components/ai/AiUnavailableNotice.jsx` | 2 | 0 | 0 | 0 |  | 3 | 0 | [ ] |
| in | `src/components/directories/AccreditationsEditor.jsx` | 4 | 0 | 0 | 0 |  | 1 | 0 | [ ] |
| in | `src/components/ai/AiRunSummary.jsx` | 4 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/shell/DirectoryAccessGuard.jsx` | 2 | 0 | 0 | 0 |  | 1 | 0 | [ ] |
| in | `src/components/integrations/IntegrationsPanel.jsx` | 3 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/client/ClientDomains.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/client/ClientIntegrations.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/client/ClientCategorisations.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/pages/client/ClientEmail.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/MessagingPanel.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/BrandLogo.jsx` | 0 | 0 | 0 | 0 |  | 2 | 0 | [ ] |
| in | `src/components/shell/PageHead.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectoryCategoriesRoute.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/EntitlementUsageHint.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/LogoImage.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/MapDataTabs.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/shell/CustomersFeaturePanel.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/shell/FeaturePanel.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectoryDomainRoute.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectorySettingsSeoRoute.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectorySearchRoute.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/directoryPanel/DirectoryPublishingRoute.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/engagement/EngagementShared.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| in | `src/components/ai/AiProvenanceNote.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| out | `src/pages/claim/ClaimManager.jsx` | 55 | 6 | 0 | 5 |  | 9 | 0 | [ ] |
| out | `src/components/experience/SitePreview.jsx` | 48 | 0 | 14 | 0 |  | 4 | 0 | [ ] |
| out | `src/components/DirectoryMap.jsx` | 3 | 0 | 0 | 0 |  | 79 | 0 | [ ] |
| out | `src/components/PricingPlans.jsx` | 29 | 2 | 0 | 2 |  | 5 | 0 | [ ] |
| out | `src/components/PublishedMapView.jsx` | 11 | 2 | 0 | 0 |  | 14 | 0 | [ ] |
| out | `src/pages/EmbedMap.jsx` | 7 | 2 | 0 | 0 |  | 11 | 0 | [ ] |
| out | `src/pages/claim/ClaimLogin.jsx` | 7 | 2 | 0 | 3 |  | 2 | 0 | [ ] |
| out | `src/components/directories/EntryPreviewBlock.jsx` | 17 | 0 | 0 | 0 |  | 7 | 0 | [ ] |
| out | `src/pages/ResetPassword.jsx` | 0 | 2 | 0 | 3 |  | 0 | 0 | [ ] |
| out | `src/components/directories/entryEdit/EntryCardPreview.jsx` | 4 | 0 | 0 | 0 | yes | 0 | 0 | [ ] |
| out | `src/pages/ForgotPassword.jsx` | 0 | 1 | 0 | 2 |  | 0 | 0 | [ ] |
| out | `src/pages/Login.jsx` | 7 | 0 | 0 | 1 |  | 0 | 0 | [ ] |
| out | `src/pages/PublicMap.jsx` | 3 | 0 | 0 | 0 |  | 4 | 0 | [ ] |
| out | `src/pages/SignUp.jsx` | 4 | 0 | 0 | 0 |  | 2 | 0 | [ ] |
| out | `src/components/AuthForm.jsx` | 0 | 1 | 0 | 0 |  | 0 | 0 | [ ] |
| out | `src/pages/Privacy.jsx` | 1 | 0 | 0 | 1 |  | 0 | 0 | [ ] |
| out | `src/pages/Terms.jsx` | 1 | 0 | 0 | 1 |  | 0 | 0 | [ ] |
| out | `src/pages/CustomDomainMap.jsx` | 1 | 0 | 0 | 0 |  | 1 | 0 | [ ] |
| out | `src/pages/MemcomMapsDemo.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| out | `src/pages/SlugMap.jsx` | 2 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| out | `src/components/SiteHeader.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |
| out | `src/components/claim/DirectorySiteFrame.jsx` | 1 | 0 | 0 | 0 |  | 0 | 0 | [ ] |

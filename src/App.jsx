import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AdminGate from "./components/AdminGate.jsx";
import ClientGate from "./components/ClientGate.jsx";

import PublicMap from "./pages/PublicMap.jsx";
import SlugMap from "./pages/SlugMap.jsx";
import Login from "./pages/Login.jsx";
import SignUp from "./pages/SignUp.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Pricing from "./pages/Pricing.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";
import EmbedMap from "./pages/EmbedMap.jsx";
import MemcomMapsDemo from "./pages/MemcomMapsDemo.jsx";

import AdminClients from "./pages/admin/AdminClients.jsx";
import AdminListings from "./pages/admin/AdminListings.jsx";
import AdminEditListing from "./pages/admin/AdminEditListing.jsx";
import AdminClientDetail from "./pages/admin/AdminClientDetail.jsx";
import AdminClientNew from "./pages/admin/AdminClientNew.jsx";
import AdminContactDetail from "./pages/admin/AdminContactDetail.jsx";
import AdminMapNew from "./pages/admin/AdminMapNew.jsx";
import AdminMapDashboard from "./pages/admin/AdminMapDashboard.jsx";
import AdminMapData from "./pages/admin/AdminMapData.jsx";
import AdminMapListings from "./pages/admin/AdminMapListings.jsx";
import AdminMapStats from "./pages/admin/AdminMapStats.jsx";
import AdminListingStats from "./pages/admin/AdminListingStats.jsx";
import AdminMaps from "./pages/admin/AdminMaps.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";
import AdminUserDetail from "./pages/admin/AdminUserDetail.jsx";
import AdminDeployments from "./pages/admin/AdminDeployments.jsx";
import AdminErrorLogs from "./pages/admin/AdminErrorLogs.jsx";
import AdminUserActivity from "./pages/admin/AdminUserActivity.jsx";
import AdminSyncLog from "./pages/admin/AdminSyncLog.jsx";
import AdminLeads from "./pages/admin/AdminLeads.jsx";
import AdminDirectoryNew from "./pages/admin/AdminDirectoryNew.jsx";
import AdminDirectoryEntries from "./pages/admin/AdminDirectoryEntries.jsx";

import ClientLayout from "./pages/client/ClientLayout.jsx";
import ClientDashboard from "./pages/client/ClientDashboard.jsx";
import ClientTeam from "./pages/client/ClientTeam.jsx";
import ClientEmail from "./pages/client/ClientEmail.jsx";
import ClientMapNew from "./pages/client/ClientMapNew.jsx";
import ClientMapDashboard from "./pages/client/ClientMapDashboard.jsx";
import ClientMapData from "./pages/client/ClientMapData.jsx";
import ClientMapListings from "./pages/client/ClientMapListings.jsx";
import MapStats from "./pages/client/MapStats.jsx";
import ListingStats from "./pages/client/ListingStats.jsx";
import ClientDirectories from "./pages/client/ClientDirectories.jsx";
import ClientDirectoryNew from "./pages/client/ClientDirectoryNew.jsx";
import ClientDirectoryEntries from "./pages/client/ClientDirectoryEntries.jsx";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<PublicMap />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/embed" element={<EmbedMap />} />
      <Route path="/memcom-maps-demo" element={<MemcomMapsDemo />} />

      {/* Client portal */}
      <Route
        path="/client"
        element={
          <ClientGate>
            <ClientLayout />
          </ClientGate>
        }
      >
        <Route index element={<ClientDashboard />} />
        <Route path="team" element={<ClientTeam />} />
        <Route path="email" element={<ClientEmail />} />
        <Route path="maps/new" element={<ClientMapNew />} />
        <Route path="maps/:mapId" element={<ClientMapDashboard />} />
        <Route path="maps/:mapId/data" element={<ClientMapData />} />
        <Route path="maps/:mapId/listings" element={<ClientMapListings />} />
        <Route path="maps/:mapId/stats" element={<MapStats />} />
        <Route path="maps/:mapId/stats/listings/:listingId" element={<ListingStats />} />
        <Route path="directories" element={<ClientDirectories />} />
        <Route path="directories/new" element={<ClientDirectoryNew />} />
        <Route path="directories/:directoryId" element={<ClientDirectoryEntries />} />
      </Route>

      {/* Admin root -> clients */}
      <Route path="/admin" element={<Navigate to="/admin/clients" replace />} />

      {/* Admin · Clients */}
      <Route
        path="/admin/clients"
        element={
          <AdminGate>
            <AdminClients />
          </AdminGate>
        }
      />

      {/* Admin · Maps (searchable list) */}
      <Route
        path="/admin/maps"
        element={
          <AdminGate>
            <AdminMaps />
          </AdminGate>
        }
      />

      {/* Admin · Legacy listings */}
      <Route
        path="/admin/listings"
        element={
          <AdminGate>
            <AdminListings />
          </AdminGate>
        }
      />

      <Route
        path="/admin/listings/:id"
        element={
          <AdminGate>
            <AdminEditListing />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId"
        element={
          <AdminGate>
            <AdminClientDetail />
          </AdminGate>
        }
      />
      <Route
        path="/admin/clients/:clientId/contacts/:contactId"
        element={
          <AdminGate>
            <AdminContactDetail />
          </AdminGate>
        }
      />
      <Route
        path="/admin/clients/new"
        element={
          <AdminGate>
            <AdminClientNew />
          </AdminGate>
        }
      />
      <Route
        path="/admin/clients/:clientId/maps/new"
        element={
          <AdminGate>
            <AdminMapNew />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId/maps/:mapId"
        element={
          <AdminGate>
            <AdminMapDashboard />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId/maps/:mapId/data"
        element={
          <AdminGate>
            <AdminMapData />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId/maps/:mapId/listings"
        element={
          <AdminGate>
            <AdminMapListings />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId/maps/:mapId/stats"
        element={
          <AdminGate>
            <AdminMapStats />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId/maps/:mapId/stats/listings/:listingId"
        element={
          <AdminGate>
            <AdminListingStats />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId/directories/new"
        element={
          <AdminGate>
            <AdminDirectoryNew />
          </AdminGate>
        }
      />

      <Route
        path="/admin/clients/:clientId/directories/:directoryId"
        element={
          <AdminGate>
            <AdminDirectoryEntries />
          </AdminGate>
        }
      />

      <Route
        path="/admin/users"
        element={
          <AdminGate>
            <AdminUsers />
          </AdminGate>
        }
      />
      <Route
        path="/admin/users/:userId"
        element={
          <AdminGate>
            <AdminUserDetail />
          </AdminGate>
        }
      />

      <Route
        path="/admin/deployments"
        element={
          <AdminGate>
            <AdminDeployments />
          </AdminGate>
        }
      />

      <Route
        path="/admin/error-log"
        element={
          <AdminGate>
            <AdminErrorLogs />
          </AdminGate>
        }
      />

      <Route
        path="/admin/user-activity"
        element={
          <AdminGate>
            <AdminUserActivity />
          </AdminGate>
        }
      />

      <Route
        path="/admin/sync-log"
        element={
          <AdminGate>
            <AdminSyncLog />
          </AdminGate>
        }
      />

      <Route
        path="/admin/leads"
        element={
          <AdminGate>
            <AdminLeads />
          </AdminGate>
        }
      />

      {/* Human-readable published map URLs: /:clientSlug/:mapSlug */}
      <Route path="/:clientSlug/:mapSlug" element={<SlugMap />} />

      {/* Fallback route to avoid blank screen on unknown hashes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

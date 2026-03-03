import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AdminGate from "./components/AdminGate.jsx";

import PublicMap from "./pages/PublicMap.jsx";
import AdminClients from "./pages/admin/AdminClients.jsx";
import AdminListings from "./pages/admin/AdminListings.jsx";
import AdminEditListing from "./pages/admin/AdminEditListing.jsx";
import AdminClientDetail from "./pages/admin/AdminClientDetail.jsx";
import AdminClientNew from "./pages/admin/AdminClientNew.jsx";
import AdminMapNew from "./pages/admin/AdminMapNew.jsx";
import EmbedMap from "./pages/EmbedMap.jsx";
import AdminMapDashboard from "./pages/admin/AdminMapDashboard.jsx";
import AdminMapData from "./pages/admin/AdminMapData.jsx";
import AdminMapListings from "./pages/admin/AdminMapListings.jsx";


export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<PublicMap />} />
      <Route path="/embed" element={<EmbedMap />} />

      {/* Admin root -> clients */}
      <Route path="/admin" element={<Navigate to="/admin/clients" replace />} />

      {/* Clients */}
      <Route
        path="/admin/clients"
        element={
          <AdminGate>
            <AdminClients />
          </AdminGate>
        }
      />

      {/* Keep existing listing routes temporarily */}
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

    </Routes>
  );
}
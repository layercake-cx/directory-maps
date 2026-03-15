import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AdminGate from "./components/AdminGate.jsx";
import ClientGate from "./components/ClientGate.jsx";

import PublicMap from "./pages/PublicMap.jsx";
import Login from "./pages/Login.jsx";
import SignUp from "./pages/SignUp.jsx";
import EmbedMap from "./pages/EmbedMap.jsx";

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
import AdminMaps from "./pages/admin/AdminMaps.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";

import ClientDashboard from "./pages/client/ClientDashboard.jsx";
import ClientMapNew from "./pages/client/ClientMapNew.jsx";
import ClientMapDashboard from "./pages/client/ClientMapDashboard.jsx";
import ClientMapData from "./pages/client/ClientMapData.jsx";
import ClientMapListings from "./pages/client/ClientMapListings.jsx";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<PublicMap />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/embed" element={<EmbedMap />} />

      {/* Client portal */}
      <Route
        path="/client"
        element={
          <ClientGate>
            <ClientDashboard />
          </ClientGate>
        }
      />
      <Route
        path="/client/maps/new"
        element={
          <ClientGate>
            <ClientMapNew />
          </ClientGate>
        }
      />
      <Route
        path="/client/maps/:mapId"
        element={
          <ClientGate>
            <ClientMapDashboard />
          </ClientGate>
        }
      />
      <Route
        path="/client/maps/:mapId/data"
        element={
          <ClientGate>
            <ClientMapData />
          </ClientGate>
        }
      />
      <Route
        path="/client/maps/:mapId/listings"
        element={
          <ClientGate>
            <ClientMapListings />
          </ClientGate>
        }
      />

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
        path="/admin/users"
        element={
          <AdminGate>
            <AdminUsers />
          </AdminGate>
        }
      />
    </Routes>
  );
}

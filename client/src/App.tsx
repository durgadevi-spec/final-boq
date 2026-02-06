import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/auth-context";
import { DataProvider } from "./lib/store";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import PendingApproval from "@/pages/PendingApproval";

import Dashboard from "@/pages/Dashboard";
import SoftwareDashboard from "@/pages/SoftwareDashboard";
import PurchaseDashboard from "@/pages/PurchaseDashboard";
import SupplierDashboard from "@/pages/SupplierDashboard";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import SupplierApproval from "@/pages/SupplierApproval";
import MaterialSubmissionApproval from "@/pages/admin/MaterialSubmissionApproval";

import CivilWallEstimator from "@/pages/estimators/CivilWallEstimator";
import FlooringEstimator from "@/pages/estimators/FlooringEstimator";
import FalseCeilingEstimator from "@/pages/estimators/FalseCeilingEstimator";
import PaintingEstimator from "@/pages/estimators/PaintingEstimator";
import DoorsEstimator from "@/pages/estimators/DoorsEstimator";
import BlindsEstimator from "@/pages/estimators/BlindsEstimator";
import ElectricalEstimator from "@/pages/estimators/ElectricalEstimator";
import PlumbingEstimator from "@/pages/estimators/PlumbingEstimator";
import MSWorkEstimator from "@/pages/estimators/MSWorkEstimator";
import SSWorkEstimator from "@/pages/estimators/SSWorkEstimator";
import FireFightingEstimator from "@/pages/estimators/FireFightingEstimator";
import DynamicEstimator from "@/pages/estimators/DynamicEstimator";

import ItemMaster from "@/pages/ItemMaster";
import Subscription from "@/pages/Subscription";
import BoqReview from "@/pages/BoqReview";
import CreateBoq from "@/pages/CreateBoq";
import CreateProject from "@/pages/CreateProject";

import SupplierMaterials from "@/pages/supplier/SupplierMaterials";
import SupplierShops from "@/pages/supplier/SupplierShops";

function Router() {
  return (
    <Switch>
      {/* ================= PUBLIC ================= */}
      <Route path="/" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />

      {/* ✅ Pending approval page (MAIN) */}
      <Route path="/pending-approval" component={PendingApproval} />

      {/* ✅ Pending approval page (ALIAS) – fixes /supplier-pending 404 */}
      <Route path="/supplier-pending" component={PendingApproval} />

      {/* ================= DASHBOARDS ================= */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/software/dashboard" component={SoftwareDashboard} />
      <Route path="/purchase/dashboard" component={PurchaseDashboard} />
      <Route path="/supplier/dashboard" component={SupplierDashboard} />

      {/* ================= MISC ================= */}
      <Route path="/subscription" component={Subscription} />
      <Route path="/create-project" component={CreateProject} />
      <Route path="/create-boq" component={CreateBoq} />
      <Route path="/item-master" component={ItemMaster} />
      <Route path="/boq-review" component={BoqReview} />

      {/* ================= ESTIMATORS ================= */}
      {/* Hardcoded estimators for predefined categories */}
      <Route path="/estimators/civil-wall" component={CivilWallEstimator} />
      <Route path="/estimators/flooring" component={FlooringEstimator} />
      <Route
        path="/estimators/false-ceiling"
        component={FalseCeilingEstimator}
      />
      <Route path="/estimators/painting" component={PaintingEstimator} />
      <Route path="/estimators/doors" component={DoorsEstimator} />
      <Route path="/estimators/blinds" component={BlindsEstimator} />
      <Route path="/estimators/electrical" component={ElectricalEstimator} />
      <Route path="/estimators/plumbing" component={PlumbingEstimator} />
      <Route path="/estimators/ms-work" component={MSWorkEstimator} />
      <Route path="/estimators/ss-work" component={SSWorkEstimator} />
      <Route
        path="/estimators/fire-fighting"
        component={FireFightingEstimator}
      />

      {/* Dynamic estimator for new database subcategories - fallback route */}
      <Route path="/estimators/:subcategory" component={DynamicEstimator} />

      {/* ================= ADMIN ================= */}
      <Route path="/admin/dashboard" component={AdminDashboard} />

      {/* ✅ Supplier Approval (MAIN) */}
      <Route path="/admin/supplier-approval" component={SupplierApproval} />

      {/* ✅ Supplier Approval (ALIAS) – fixes /admin/suppliers */}
      <Route path="/admin/suppliers" component={SupplierApproval} />

      <Route
        path="/admin/material-submissions"
        component={MaterialSubmissionApproval}
      />

      {/* ================= SUPPLIER ================= */}
      <Route path="/supplier/shops" component={SupplierShops} />
      <Route path="/supplier/materials" component={SupplierMaterials} />

      {/* ================= FALLBACK ================= */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DataProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </DataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

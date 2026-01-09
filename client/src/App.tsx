import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth-context";
import { DataProvider } from "./lib/store";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import AdminDashboard from "@/pages/admin/AdminDashboard";
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
import ItemMaster from "@/pages/ItemMaster";
import Subscription from "@/pages/Subscription";
import SupplierMaterials from "@/pages/supplier/SupplierMaterials";
import SupplierShops from "@/pages/supplier/SupplierShops";
import MaterialSubmissionApproval from "@/pages/admin/MaterialSubmissionApproval";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/subscription" component={Subscription} />
      
      <Route path="/estimators/civil-wall" component={CivilWallEstimator} />
      <Route path="/estimators/flooring" component={FlooringEstimator} />
      <Route path="/estimators/false-ceiling" component={FalseCeilingEstimator} />
      <Route path="/estimators/painting" component={PaintingEstimator} />
      <Route path="/estimators/doors" component={DoorsEstimator} />
      <Route path="/estimators/blinds" component={BlindsEstimator} />
      <Route path="/estimators/electrical" component={ElectricalEstimator} />
      <Route path="/estimators/plumbing" component={PlumbingEstimator} />
      <Route path="/estimators/ms-work" component={MSWorkEstimator} />
      <Route path="/estimators/ss-work" component={SSWorkEstimator} />
      <Route path="/estimators/fire-fighting" component={FireFightingEstimator} />
      <Route path="/item-master" component={ItemMaster} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/material-submissions" component={MaterialSubmissionApproval} />
      <Route path="/supplier/shops" component={SupplierShops} />
      <Route path="/supplier/materials" component={SupplierMaterials} />
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

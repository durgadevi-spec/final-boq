import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Users, Settings, ShoppingCart, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

/* =========================
   ROLE DEFINITIONS
========================= */
type UserRole =
  | "admin"
  | "software_team"
  | "purchase_team"
  | "user_client"
  | "supplier"
  | "pre_sales"
  | "contractor";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { signup } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    mobileNumber: "",
    password: "",
    confirmPassword: "",

    companyName: "",
    gstNumber: "",
    businessAddress: "",

    department: "",
    employeeCode: "",
  });

  const [confirmInfo, setConfirmInfo] = useState(false);

  /* =========================
     ROLES LIST
  ========================= */
  const roles = [
    {
      value: "admin",
      label: "Admin",
      icon: Settings,
      description: "Full system access",
    },
    {
      value: "software_team",
      label: "Software Team",
      icon: Users,
      description: "Technical management",
    },
    {
      value: "purchase_team",
      label: "Purchase Team",
      icon: ShoppingCart,
      description: "Procurement management",
    },
    {
      value: "user_client",
      label: "User / Client",
      icon: User,
      description: "General system access",
    },
    {
      value: "pre_sales",
      label: "Pre-Sales",
      icon: ShoppingCart,
      description: "Create projects and BOQs",
    },
    {
      value: "contractor",
      label: "Contractor",
      icon: Settings,
      description: "Access sub-categories and estimators",
    },
    {
      value: "supplier",
      label: "Supplier",
      icon: Building2,
      description: "Material supplier",
    },
  ];

  /* =========================
     VALIDATION
  ========================= */
  const validateForm = () => {
    if (!selectedRole) {
      toast({
        title: "Error",
        description: "Please select a role",
        variant: "destructive",
      });
      return false;
    }

    if (
      !formData.fullName.trim() ||
      !formData.email.trim() ||
      !formData.mobileNumber.trim()
    ) {
      toast({
        title: "Error",
        description: "All basic fields are required",
        variant: "destructive",
      });
      return false;
    }

    if (!formData.password || formData.password !== formData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return false;
    }

    if (selectedRole === "supplier") {
      if (
        !formData.companyName ||
        !formData.gstNumber ||
        !formData.businessAddress
      ) {
        toast({
          title: "Error",
          description: "Supplier details are required",
          variant: "destructive",
        });
        return false;
      }
    }

    if (!confirmInfo) {
      toast({
        title: "Error",
        description: "Please confirm the information",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  /* =========================
     SUBMIT HANDLER
  ========================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await signup(
        formData.email,
        formData.password,
        selectedRole,
        formData.fullName,
        formData.mobileNumber,
        formData.department,
        formData.employeeCode,
        formData.companyName,
        formData.gstNumber,
        formData.businessAddress
      );

      // ✅ Supplier: go to separate pending approval page
      if (selectedRole === "supplier") {
        toast({
          title: "Request Submitted",
          description: "Your supplier account is waiting for admin approval.",
        });

        setLocation("/pending-approval");
        return;
      }

      // ✅ Other roles: normal behavior
      toast({
        title: "Account Created",
        description: "Please login using your email and password",
      });

      // ✅ REDIRECT TO LOGIN PAGE
      setLocation("/");
    } catch (err: any) {
      const errorMsg = err?.message || "Create account failed";
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <Card className="border-2 border-gray-200 shadow-2xl bg-white">
          <CardHeader className="text-center pb-6 border-b">
            <CardTitle className="text-3xl font-bold">
              Create Your Account
            </CardTitle>
            <CardDescription>
              Register to access the BOQ Management System
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ROLE SELECTION */}
              <RadioGroup
                value={selectedRole || ""}
                onValueChange={(value) => setSelectedRole(value as UserRole)}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {roles.map((role) => (
                  <div key={role.value}>
                    <RadioGroupItem
                      value={role.value}
                      id={role.value}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={role.value}
                      className="flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer peer-data-[state=checked]:border-blue-500"
                    >
                      <role.icon className="h-6 w-6 mb-2" />
                      <div className="font-medium">{role.label}</div>
                      <div className="text-xs text-gray-500">
                        {role.description}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              {/* COMMON FIELDS */}
              <Input
                placeholder="Full Name"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
              />
              <Input
                placeholder="Mobile Number"
                value={formData.mobileNumber}
                onChange={(e) =>
                  setFormData({ ...formData, mobileNumber: e.target.value })
                }
              />
              <Input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
              <Input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
              <Input
                type="password"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
              />

              {/* SUPPLIER ONLY */}
              {selectedRole === "supplier" && (
                <>
                  <Input
                    placeholder="Company Name"
                    value={formData.companyName}
                    onChange={(e) =>
                      setFormData({ ...formData, companyName: e.target.value })
                    }
                  />
                  <Input
                    placeholder="GST Number"
                    value={formData.gstNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, gstNumber: e.target.value })
                    }
                  />
                  <Textarea
                    placeholder="Business Address"
                    value={formData.businessAddress}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        businessAddress: e.target.value,
                      })
                    }
                  />
                </>
              )}

              {/* CONFIRM */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={confirmInfo}
                  onCheckedChange={(checked) =>
                    setConfirmInfo(checked === true)
                  }
                />
                <Label>I confirm the above information is correct</Label>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? "Creating..." : "Create Account"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <Link href="/" className="text-blue-600 hover:underline">
              Already have an account? Login
            </Link>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

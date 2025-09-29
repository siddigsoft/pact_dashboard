import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/context/AppContext";
import { Link } from "react-router-dom";
import { AlertCircle, User, Lock, Loader2, LucideShieldCheck, Users2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import RoleSelection from '@/components/registration/RoleSelection';
import LocationSelection from '@/components/registration/LocationSelection';
import { hubs, getLocalitiesByState } from "@/data/sudanStates";
import { useToast } from "@/hooks/use-toast";
import { useNotificationManager } from "@/hooks/use-notification-manager";

const Register = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    employeeId: "",
    password: "",
    confirmPassword: "",
    role: "dataCollector" as string,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { registerUser } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedHub, setSelectedHub] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [localities, setLocalities] = useState<{ id: string; name: string; }[]>([]);

  const { sendNotification } = useNotificationManager();
  const managementRoles = ['admin', 'ict', 'supervisor', 'fom', 'financialAdmin'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const needsLocationValidation = formData.role === 'dataCollector' || formData.role === 'coordinator';
    const needsHubValidation = formData.role === 'supervisor';

    if (needsLocationValidation && (!selectedHub || !selectedState)) {
      toast({
        title: "Missing Location",
        description: "Please select your hub and state",
        variant: "destructive"
      });
      return;
    }

    if (needsHubValidation && !selectedHub) {
      toast({
        title: "Missing Hub",
        description: "Please select your hub office",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const success = await registerUser({
        ...formData,
        hubId: selectedHub,
        stateId: selectedState,
      });

      if (success) {
        // Show success notification
        sendNotification({
          title: "Registration Successful",
          message: "Your registration has been submitted successfully",
          type: "success"
        });

        // Redirect based on role
        if (managementRoles.includes(formData.role)) {
          navigate("/registration-success?type=management");
        } else {
          navigate("/registration-success");
        }
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Failed",
        description: "An error occurred during registration. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleRoleChange = (value: string) => {
    setFormData((prev) => ({ ...prev, role: value }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }
    
    if (!formData.phone && (formData.role === 'dataCollector' || formData.role === 'coordinator')) {
      newErrors.phone = "Phone number is required for field team roles";
    }
    
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    if (formData.role === 'dataCollector' || formData.role === 'coordinator') {
      setSelectedHub("");
      setSelectedState("");
      setAvailableStates([]);
      setLocalities([]);
    }
  }, [formData.role]);

  useEffect(() => {
    if (selectedHub) {
      const hub = hubs.find(h => h.id === selectedHub);
      if (hub) {
        setAvailableStates(hub.states);
        setSelectedState("");
        setLocalities([]);
      }
    }
  }, [selectedHub]);

  useEffect(() => {
    if (selectedState) {
      const stateLocalities = getLocalitiesByState(selectedState);
      setLocalities(stateLocalities);
    }
  }, [selectedState]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <LucideShieldCheck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription className="text-base">
            Register to access PACT Consultancy
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <Tabs defaultValue="field-team">
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="field-team" className="flex items-center gap-2">
                  <Users2 size={16} />
                  Field Team
                </TabsTrigger>
                <TabsTrigger value="admin-roles">Management Roles</TabsTrigger>
              </TabsList>
              
              <TabsContent value="field-team">
                <div className="space-y-6">
                  <RoleSelection
                    role={formData.role}
                    onRoleChange={handleRoleChange}
                    isManagementTab={false}
                  />

                  {(formData.role === 'dataCollector' || formData.role === 'coordinator') && (
                    <LocationSelection
                      selectedHub={selectedHub}
                      setSelectedHub={setSelectedHub}
                      selectedState={selectedState}
                      setSelectedState={setSelectedState}
                      availableStates={availableStates}
                      localities={localities}
                    />
                  )}

                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Personal Information
                    </h3>
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">
                          Full Name<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          placeholder="Enter your full name"
                          value={formData.name}
                          onChange={handleChange}
                          className={errors.name ? "border-red-500" : ""}
                        />
                        {errors.name && (
                          <p className="text-xs text-red-500">{errors.name}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">
                          Email<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="Enter your email"
                          value={formData.email}
                          onChange={handleChange}
                          className={errors.email ? "border-red-500" : ""}
                        />
                        {errors.email && (
                          <p className="text-xs text-red-500">{errors.email}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="phone">
                            Phone Number
                            {(formData.role === 'dataCollector' || formData.role === 'coordinator') && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </Label>
                          <Input
                            id="phone"
                            name="phone"
                            placeholder="Enter your phone number"
                            value={formData.phone}
                            onChange={handleChange}
                            className={errors.phone ? "border-red-500" : ""}
                          />
                          {errors.phone && (
                            <p className="text-xs text-red-500">{errors.phone}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="employeeId">Employee ID (Optional)</Label>
                          <Input
                            id="employeeId"
                            name="employeeId"
                            placeholder="Enter your employee ID"
                            value={formData.employeeId}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Security
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="password">
                          Password<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          placeholder="Create a password"
                          value={formData.password}
                          onChange={handleChange}
                          className={errors.password ? "border-red-500" : ""}
                        />
                        {errors.password && (
                          <p className="text-xs text-red-500">{errors.password}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">
                          Confirm Password<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type="password"
                          placeholder="Confirm your password"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          className={errors.confirmPassword ? "border-red-500" : ""}
                        />
                        {errors.confirmPassword && (
                          <p className="text-xs text-red-500">{errors.confirmPassword}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="admin-roles">
                <div className="space-y-6">
                  <RoleSelection
                    role={formData.role}
                    onRoleChange={handleRoleChange}
                    isManagementTab={true}
                  />

                  {formData.role === 'supervisor' && (
                    <LocationSelection
                      selectedHub={selectedHub}
                      setSelectedHub={setSelectedHub}
                      selectedState={selectedState}
                      setSelectedState={setSelectedState}
                      availableStates={availableStates}
                      localities={localities}
                      showStateSelection={false}
                    />
                  )}

                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Management Team Registration</AlertTitle>
                    <AlertDescription>
                      These roles require special approval from existing administrators
                    </AlertDescription>
                  </Alert>

                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Personal Information
                    </h3>
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">
                          Full Name<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          placeholder="Enter your full name"
                          value={formData.name}
                          onChange={handleChange}
                          className={errors.name ? "border-red-500" : ""}
                        />
                        {errors.name && (
                          <p className="text-xs text-red-500">{errors.name}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">
                          Email<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="Enter your email"
                          value={formData.email}
                          onChange={handleChange}
                          className={errors.email ? "border-red-500" : ""}
                        />
                        {errors.email && (
                          <p className="text-xs text-red-500">{errors.email}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="phone">
                            Phone Number
                            {(formData.role === 'dataCollector' || formData.role === 'coordinator') && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </Label>
                          <Input
                            id="phone"
                            name="phone"
                            placeholder="Enter your phone number"
                            value={formData.phone}
                            onChange={handleChange}
                            className={errors.phone ? "border-red-500" : ""}
                          />
                          {errors.phone && (
                            <p className="text-xs text-red-500">{errors.phone}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="employeeId">Employee ID (Optional)</Label>
                          <Input
                            id="employeeId"
                            name="employeeId"
                            placeholder="Enter your employee ID"
                            value={formData.employeeId}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Security
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="password">
                          Password<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          placeholder="Create a password"
                          value={formData.password}
                          onChange={handleChange}
                          className={errors.password ? "border-red-500" : ""}
                        />
                        {errors.password && (
                          <p className="text-xs text-red-500">{errors.password}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">
                          Confirm Password<span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type="password"
                          placeholder="Confirm your password"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          className={errors.confirmPassword ? "border-red-500" : ""}
                        />
                        {errors.confirmPassword && (
                          <p className="text-xs text-red-500">{errors.confirmPassword}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>

          <CardFooter className="flex flex-col">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                "Register"
              )}
            </Button>
            <p className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Sign In
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Register;

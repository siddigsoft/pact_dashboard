import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/context/AppContext";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, LucideShieldCheck, ChevronRight, ChevronLeft, Check, User, Lock, Briefcase, CheckCircle2 } from "lucide-react";
import RoleSelection from '@/components/registration/RoleSelection';
import LocationSelection from '@/components/registration/LocationSelection';
import { hubs, getLocalitiesByState } from "@/data/sudanStates";
import { useToast } from "@/hooks/use-toast";
import { useNotificationManager } from "@/hooks/use-notification-manager";
import { useDevice } from "@/hooks/use-device";
import { MobileRegisterScreen } from "@/components/mobile/MobileRegisterScreen";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";

const STEPS = [
  { id: 1, label: "Account", icon: User },
  { id: 2, label: "Role", icon: Briefcase },
  { id: 3, label: "Profile", icon: LucideShieldCheck },
  { id: 4, label: "Confirm", icon: CheckCircle2 },
];

const Register = () => {
  const { isNative, isMobile: isDeviceMobile, isLoading: isDeviceLoading } = useDevice();
  const isMobileView = isNative || isDeviceMobile;

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    employeeId: "",
    password: "",
    confirmPassword: "",
    role: "DataCollector" as string,
    emergencyContact: "",
    bio: "",
    avatar: "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailAlreadyRegistered, setEmailAlreadyRegistered] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { registerUser } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedHub, setSelectedHub] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedLocality, setSelectedLocality] = useState<string>("");
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [localities, setLocalities] = useState<{ id: string; name: string; }[]>([]);

  const { sendNotification } = useNotificationManager();

  const managementRoles = ['admin', 'ict', 'supervisor', 'fom', 'financialAdmin', 'countryDirector', 'dataTeam', 'Admin', 'ICT', 'Supervisor', 'Field Operation Manager (FOM)', 'FinancialAdmin', 'CountryDirector', 'DataTeam'];

  const checkEmailExists = useCallback(async (emailToCheck: string) => {
    if (!emailToCheck || !/\S+@\S+\.\S+/.test(emailToCheck)) {
      setEmailAlreadyRegistered(false);
      setCheckingEmail(false);
      return;
    }
    setCheckingEmail(true);
    try {
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 8000)
      );
      const rpcPromise = supabase.rpc('check_email_exists', { check_email: emailToCheck.trim() });
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
      if (!error && data === true) {
        setEmailAlreadyRegistered(true);
      } else {
        setEmailAlreadyRegistered(false);
      }
    } catch {
      setEmailAlreadyRegistered(false);
    } finally {
      setCheckingEmail(false);
    }
  }, []);

  useEffect(() => {
    if (emailCheckTimerRef.current) clearTimeout(emailCheckTimerRef.current);
    if (!formData.email || formData.email.length < 5) {
      setEmailAlreadyRegistered(false);
      return;
    }
    emailCheckTimerRef.current = setTimeout(() => { checkEmailExists(formData.email); }, 600);
    return () => { if (emailCheckTimerRef.current) clearTimeout(emailCheckTimerRef.current); };
  }, [formData.email, checkEmailExists]);

  useEffect(() => {
    if (selectedHub) {
      const hub = hubs.find(h => h.id === selectedHub);
      if (hub) {
        setAvailableStates(hub.states);
        setSelectedState("");
        setSelectedLocality("");
        setLocalities([]);
      }
    }
  }, [selectedHub]);

  useEffect(() => {
    if (selectedState) {
      const stateLocalities = getLocalitiesByState(selectedState);
      setLocalities(stateLocalities);
      setSelectedLocality("");
    }
  }, [selectedState]);

  if (isMobileView && !isDeviceLoading) {
    return <MobileRegisterScreen />;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, avatar: "Photo must be under 2MB" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatarPreview(dataUrl);
      setFormData(prev => ({ ...prev, avatar: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleRoleChange = (value: string) => {
    setFormData((prev) => ({ ...prev, role: value }));
    setSelectedHub("");
    setSelectedState("");
    setSelectedLocality("");
    setAvailableStates([]);
    setLocalities([]);
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!formData.name.trim()) newErrors.name = "Full name is required";
      if (!formData.email.trim()) newErrors.email = "Email is required";
      else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Email is invalid";
      if (emailAlreadyRegistered) newErrors.email = "This email is already registered";
      if (!formData.password) newErrors.password = "Password is required";
      else if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters";
      if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";
    }
    if (step === 2) {
      const needsLocation = formData.role === 'DataCollector' || formData.role === 'Coordinator' || formData.role === 'dataCollector' || formData.role === 'coordinator';
      const needsHub = formData.role === 'Supervisor' || formData.role === 'supervisor';
      if (needsLocation && (!selectedHub || !selectedState || !selectedLocality)) {
        newErrors.location = "Please select your hub, state, and locality";
      }
      if (needsHub && !selectedHub) {
        newErrors.location = "Please select your hub office";
      }
    }
    if (step === 3) {
      const needsPhone = formData.role === 'DataCollector' || formData.role === 'Coordinator' || formData.role === 'dataCollector' || formData.role === 'coordinator';
      if (needsPhone && !formData.phone) newErrors.phone = "Phone number is required for field team roles";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((s) => Math.min(s + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 1));
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;
    setIsLoading(true);
    try {
      if (formData.email.trim() && /\S+@\S+\.\S+/.test(formData.email)) {
        try {
          const { data: emailExists } = await supabase.rpc('check_email_exists', { check_email: formData.email.trim() });
          if (emailExists === true) {
            setEmailAlreadyRegistered(true);
            setCurrentStep(1);
            toast({ title: "Email already registered", description: "This email is already in use. Please sign in or reset your password.", variant: "destructive" });
            setIsLoading(false);
            return;
          }
        } catch {}
      }

      const success = await registerUser({
        ...formData,
        hubId: selectedHub,
        stateId: selectedState,
        localityId: selectedLocality,
      });

      if (success) {
        sendNotification({ title: "Registration Successful", message: "Your registration has been submitted. An admin will review it shortly.", type: "success" });
        setCurrentStep(4);
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({ title: "Registration Failed", description: "An error occurred during registration. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleLabel = () => {
    const labels: Record<string, string> = {
      DataCollector: "Data Collector", dataCollector: "Data Collector",
      Coordinator: "Coordinator", coordinator: "Coordinator",
      Supervisor: "Regional Supervisor", supervisor: "Regional Supervisor",
      Admin: "System Administrator", admin: "System Administrator",
      ICT: "ICT Team Member", ict: "ICT Team Member",
      'Field Operation Manager (FOM)': "Field Operations Manager", fom: "Field Operations Manager",
      FinancialAdmin: "Financial Administrator", financialAdmin: "Financial Administrator",
      CountryDirector: "Country Director", countryDirector: "Country Director",
      DataTeam: "Data Team", dataTeam: "Data Team",
    };
    return labels[formData.role] || formData.role;
  };

  const isManagementRole = managementRoles.includes(formData.role);
  const isFieldRole = formData.role === 'DataCollector' || formData.role === 'dataCollector' || formData.role === 'Coordinator' || formData.role === 'coordinator';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4 text-center pb-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <LucideShieldCheck className="h-7 w-7 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
            <CardDescription className="text-sm mt-1">Register to access PACT Consultancy</CardDescription>
          </div>

          {/* Step Progress */}
          {currentStep < 4 && (
            <div className="flex items-center justify-center gap-0">
              {STEPS.slice(0, 3).map((step, idx) => {
                const Icon = step.icon;
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                return (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center gap-1">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompleted ? 'bg-primary border-primary text-primary-foreground' :
                        isCurrent ? 'border-primary text-primary bg-primary/10' :
                        'border-muted-foreground/30 text-muted-foreground/50'
                      }`}>
                        {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className={`text-[10px] font-medium ${isCurrent ? 'text-primary' : isCompleted ? 'text-primary/70' : 'text-muted-foreground/50'}`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < 2 && (
                      <div className={`h-0.5 w-16 mt-[-18px] mx-1 transition-colors ${currentStep > step.id ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </CardHeader>

        <form onSubmit={currentStep === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
          <CardContent className="space-y-5">

            {/* Step 1: Account Details */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="font-semibold text-base">Account Details</h2>
                  <p className="text-xs text-muted-foreground">Set up your login credentials</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="name" name="name" placeholder="Enter your full name"
                    value={formData.name} onChange={handleChange}
                    className={errors.name ? "border-red-500" : ""}
                    data-testid="input-name"
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                  <Input
                    id="email" name="email" type="email" placeholder="Enter your email"
                    value={formData.email} onChange={handleChange}
                    className={errors.email ? "border-red-500" : ""}
                    data-testid="input-email"
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                  {checkingEmail && !errors.email && formData.email.length >= 5 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking email...
                    </p>
                  )}
                  {emailAlreadyRegistered && !errors.email && !checkingEmail && (
                    <div className="mt-1 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md" data-testid="alert-email-exists">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="text-amber-800 dark:text-amber-200 font-medium">This email is already registered</p>
                          <p className="text-amber-700 dark:text-amber-300 mt-1">
                            <Link to="/forgot-password" className="text-primary font-semibold hover:underline">Reset your password</Link>{' '}or{' '}
                            <Link to="/auth?tab=login" className="text-primary font-semibold hover:underline">Sign in instead</Link>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                    <Input
                      id="password" name="password" type="password" placeholder="Min 6 characters"
                      value={formData.password} onChange={handleChange}
                      className={errors.password ? "border-red-500" : ""}
                      data-testid="input-password"
                    />
                    {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password <span className="text-red-500">*</span></Label>
                    <Input
                      id="confirmPassword" name="confirmPassword" type="password" placeholder="Repeat password"
                      value={formData.confirmPassword} onChange={handleChange}
                      className={errors.confirmPassword ? "border-red-500" : ""}
                      data-testid="input-confirm-password"
                    />
                    {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Role Request */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="font-semibold text-base">Role Request</h2>
                  <p className="text-xs text-muted-foreground">Select your intended role and location</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Field Roles</h3>
                    <RoleSelection role={formData.role} onRoleChange={handleRoleChange} isManagementTab={false} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Management Roles</h3>
                    <RoleSelection role={formData.role} onRoleChange={handleRoleChange} isManagementTab={true} />
                  </div>
                </div>

                {(isFieldRole || formData.role === 'Supervisor' || formData.role === 'supervisor') && (
                  <div className="mt-2">
                    <LocationSelection
                      selectedHub={selectedHub} setSelectedHub={setSelectedHub}
                      selectedState={selectedState} setSelectedState={setSelectedState}
                      selectedLocality={selectedLocality} setSelectedLocality={setSelectedLocality}
                      availableStates={availableStates} localities={localities}
                      localityRequired={isFieldRole}
                      showStateSelection={isFieldRole}
                    />
                  </div>
                )}

                {errors.location && (
                  <p className="text-xs text-red-500 mt-1">{errors.location}</p>
                )}

                {isManagementRole && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
                    <strong>Note:</strong> Management roles require special approval from existing administrators before access is granted.
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Profile Setup */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="font-semibold text-base">Profile Setup</h2>
                  <p className="text-xs text-muted-foreground">Add your contact and profile information</p>
                </div>

                {/* Profile Photo Upload */}
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-muted/30 flex items-center justify-center">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Profile preview" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-8 w-8 text-muted-foreground/50" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <label htmlFor="avatar-upload" className="cursor-pointer">
                      <span className="text-xs font-medium text-primary underline underline-offset-2">
                        {avatarPreview ? "Change photo" : "Upload profile photo"}
                      </span>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleAvatarChange}
                        data-testid="input-avatar-upload"
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">Optional · JPG, PNG, WEBP · Max 2MB</p>
                    {errors.avatar && <p className="text-xs text-red-500">{errors.avatar}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      Phone Number {isFieldRole && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id="phone" name="phone" placeholder="e.g. +249 9XX XXX XXXX"
                      value={formData.phone} onChange={handleChange}
                      className={errors.phone ? "border-red-500" : ""}
                      data-testid="input-phone"
                    />
                    {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employeeId">Employee ID <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                    <Input
                      id="employeeId" name="employeeId" placeholder="e.g. EMP-12345"
                      value={formData.employeeId} onChange={handleChange}
                      data-testid="input-employee-id"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyContact">Emergency Contact <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                  <Input
                    id="emergencyContact" name="emergencyContact" placeholder="Name and phone number"
                    value={formData.emergencyContact} onChange={handleChange}
                    data-testid="input-emergency-contact"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Short Bio <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                  <Textarea
                    id="bio" name="bio" placeholder="Brief description of your background and experience"
                    value={formData.bio}
                    onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                    className="resize-none" rows={3}
                    data-testid="textarea-bio"
                  />
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                  <p className="font-medium">Registration Summary</p>
                  <p className="text-muted-foreground text-xs"><span className="text-foreground font-medium">Name:</span> {formData.name}</p>
                  <p className="text-muted-foreground text-xs"><span className="text-foreground font-medium">Email:</span> {formData.email}</p>
                  <p className="text-muted-foreground text-xs"><span className="text-foreground font-medium">Requested Role:</span> {getRoleLabel()}</p>
                </div>
              </div>
            )}

            {/* Step 4: Pending Confirmation */}
            {currentStep === 4 && (
              <div className="py-4 text-center space-y-6">
                <div className="flex justify-center">
                  <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-green-700 dark:text-green-400">Registration Submitted!</h2>
                  <p className="text-muted-foreground text-sm mt-2">Your account is pending activation by an administrator.</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4 text-left space-y-3">
                  <p className="font-medium text-sm">What happens next?</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</div>
                      <span>An admin will review your registration and requested role</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</div>
                      <span>You'll receive an in-app notification once your account is activated</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</div>
                      <span>Typical activation time is 1–2 business days</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
                  <strong>Tip:</strong> You can log in to check your account status at any time. If you don't hear back within 2 days, contact your supervisor.
                </div>
                <Link to="/auth">
                  <Button variant="outline" className="mt-2" data-testid="button-go-to-login">
                    Return to Login
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>

          {currentStep < 4 && (
            <CardFooter className="flex flex-col gap-3">
              <div className="flex gap-3 w-full">
                {currentStep > 1 && (
                  <Button type="button" variant="outline" onClick={handleBack} className="flex-1" data-testid="button-back">
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                )}
                {currentStep < 3 ? (
                  <Button type="submit" className="flex-1" data-testid="button-next">
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="submit" className="flex-1" disabled={isLoading} data-testid="button-submit">
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                    ) : (
                      <><Check className="mr-2 h-4 w-4" /> Submit Registration</>
                    )}
                  </Button>
                )}
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline">Sign In</Link>
              </p>
            </CardFooter>
          )}
        </form>
      </Card>
    </div>
  );
};

export default Register;


import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/AppContext";
import { useNotificationManager } from "@/hooks/use-notification-manager";
import { supabase } from "@/integrations/supabase/client";

interface RegistrationFormData {
  name: string;
  email: string;
  phone: string;
  employeeId: string;
  password: string;
  confirmPassword: string;
  role: string;
  hubId?: string;
  stateId?: string;
  localityId?: string;
  avatar?: string;
}

export const useRegistrationForm = () => {
  const [formData, setFormData] = useState<RegistrationFormData>({
    name: "",
    email: "",
    phone: "",
    employeeId: "",
    password: "",
    confirmPassword: "",
    role: "dataCollector",
    hubId: "",
    stateId: "",
    localityId: "",
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const { toast } = useToast();
  const { registerUser } = useAppContext();
  const navigate = useNavigate();
  const { sendNotification } = useNotificationManager();

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

  const handleHubChange = (value: string) => {
    setFormData((prev) => ({ ...prev, hubId: value }));
  };

  const handleStateChange = (value: string) => {
    setFormData((prev) => ({ ...prev, stateId: value }));
  };

  const handleAvatarChange = async (file: File | null) => {
    setAvatarFile(file);
    
    if (file) {
      // Create a preview URL for the UI
      const fileUrl = URL.createObjectURL(file);
      setAvatarUrl(fileUrl);
    } else {
      setAvatarUrl(null);
    }
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!avatarFile) return null;
    
    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      
      // Upload to Supabase Storage if available
      const { error, data } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile);
        
      if (error) {
        console.error("Error uploading avatar:", error);
        return null;
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(data?.path || fileName);
      
      return publicUrl;
      
    } catch (error) {
      console.error("Avatar upload error:", error);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (validate()) {
      setIsLoading(true);
      
      try {
        // First register the user
        const success = await registerUser({
          ...formData,
          avatar: avatarUrl
        });
        
        if (success) {
          // Navigate to success page
          navigate('/registration-success');
          
          // Send notifications to admins with a valid notification type
          sendNotification({
            title: "New User Registration",
            message: `${formData.name} (${formData.role}) has registered and is awaiting approval.`,
            type: "info"  // Changed from "user_registration" to "info"
          });
        }
      } catch (error) {
        console.error("Registration submission error:", error);
        toast({
          title: "Registration error",
          description: "Failed to complete registration. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return {
    formData,
    isLoading,
    errors,
    avatarUrl,
    setIsLoading,
    handleChange,
    handleRoleChange,
    handleHubChange,
    handleStateChange,
    handleAvatarChange,
    uploadAvatar,
    validate,
    handleSubmit,
    registerUser,
    sendNotification,
    navigate,
    toast
  };
};


import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export const useMutationHandlers = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleMutation = async (
    mutationFn: () => Promise<void>, 
    successMessage: string, 
    errorMessage: string,
    redirectPath: string = "/mmp"
  ) => {
    setLoading(true);
    try {
      await mutationFn();
      toast({ 
        title: "Success", 
        description: successMessage 
      });
      // Add a small delay to allow state updates to complete
      setTimeout(() => {
        navigate(redirectPath);
      }, 100);
    } catch (error) {
      console.error(errorMessage, error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return { handleMutation, loading };
};


import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/context/wallet/WalletContext";
import { useUser } from "@/context/user/UserContext";
import { WalletBalance } from "@/components/WalletBalance";
import { WalletStats } from "@/components/WalletStats";
import { TransactionHistory } from "@/components/TransactionHistory";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Wallet as WalletIcon, PiggyBank, Clock, Filter, Download, 
  ReceiptText, BanknoteIcon, CreditCard 
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentMethodForm } from "@/components/PaymentMethodForm";
import { useSettings } from "@/context/settings/SettingsContext";

const Wallet: React.FC = () => {
  const { transactions, withdrawFunds } = useWallet();
  const { currentUser, updateUser } = useUser();
  const { walletSettings, updateWalletSettings } = useSettings();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isPaymentMethodDialogOpen, setIsPaymentMethodDialogOpen] = useState(false);

  const isDataCollectorOrCoordinator = () => {
    return currentUser?.role === 'dataCollector' || 
           currentUser?.role === 'datacollector' || 
           currentUser?.role === 'coordinator';
  };

  // Filter transactions to only show the current user's transactions
  const userTransactions = transactions.filter(
    transaction => transaction.userId === currentUser?.id
  );

  // Compute wallet balance from completed transactions (credits - debits)
  const computedBalance = userTransactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);

  // Calculate estimated next payment date (3 days from now)
  const estimatedNextPayment = format(addDays(new Date(), 3), "MMM d, yyyy");

  // Calculate transaction stats
  const siteVisitPayments = userTransactions.filter(
    t => t.type === 'credit' && t.siteVisitId
  );
  const averageSiteVisitPayment = siteVisitPayments.length > 0 
    ? siteVisitPayments.reduce((sum, t) => sum + t.amount, 0) / siteVisitPayments.length
    : 0;

  const handleExportTransactions = () => {
    toast({
      title: "Exporting transactions",
      description: "Your transaction history will be downloaded as CSV.",
    });
    // In a real app, implement CSV export logic here
  };

  const handleAddPaymentMethod = (values: any) => {
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        bankAccount: values
      };
      
      updateUser(updatedUser);

      // Persist bank account into wallet_settings.notification_prefs
      try {
        updateWalletSettings({
          notification_prefs: {
            ...(walletSettings?.notification_prefs || {}),
            bank_account: values,
          },
        });
      } catch (e) {
        console.warn('Failed to persist bank account to wallet_settings:', e);
      }
      
      toast({
        title: "Payment method added",
        description: "Your payment method has been successfully added.",
      });
      
      setIsPaymentMethodDialogOpen(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-background to-muted p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="hover:bg-background/50"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Personal Wallet
            </h1>
            <p className="text-muted-foreground">
              Manage your funds and monitor your earnings
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <WithdrawDialog 
            currentUserCurrency={currentUser?.wallet.currency || "SDG"}
            isDataCollectorOrCoordinator={isDataCollectorOrCoordinator()}
            onWithdraw={withdrawFunds}
          />
          <Button 
            variant="outline" 
            onClick={handleExportTransactions}
            className="flex gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Payment Method Dialog */}
      <Dialog open={isPaymentMethodDialogOpen} onOpenChange={setIsPaymentMethodDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
          </DialogHeader>
          <PaymentMethodForm 
            onSubmit={handleAddPaymentMethod}
            defaultValues={currentUser?.bankAccount}
            isSubmitting={false}
          />
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full md:w-1/2 mb-4">
          <TabsTrigger value="overview" className="flex gap-2 items-center">
            <WalletIcon className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="history" className="flex gap-2 items-center">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="payment-methods" className="flex gap-2 items-center">
            <CreditCard className="h-4 w-4" />
            Payment Methods
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <WalletBalance 
            balance={computedBalance || 0} 
            currency={currentUser?.wallet.currency || "SDG"} 
          />
          
          <WalletStats />
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Next Payment</CardTitle>
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {estimatedNextPayment}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Estimated date for your next payment
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Visit Payment</CardTitle>
                <ReceiptText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currentUser?.wallet.currency} {averageSiteVisitPayment.toLocaleString('en-US', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Average earned per completed site visit
                </p>
              </CardContent>
            </Card>
          </div>
          
          <div className="mt-6">
            <h2 className="text-xl font-bold mb-4">Recent Transactions</h2>
            <TransactionHistory 
              transactions={userTransactions.slice(0, 5)} 
              showFilters={false}
            />
            {userTransactions.length > 5 && (
              <div className="flex justify-center mt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setActiveTab("history")}
                  className="flex gap-2"
                >
                  <Filter className="h-4 w-4" />
                  View All Transactions
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>Complete history of all your payments and withdrawals</CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionHistory 
                transactions={userTransactions} 
                showFilters={true}
              />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="payment-methods" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>Manage your withdrawal payment methods</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {currentUser?.bankAccount ? (
                  <div className="flex items-center justify-between p-4 border rounded-md">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded">
                        <BanknoteIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{currentUser.bankAccount.bankName}</p>
                        <p className="text-sm text-muted-foreground">
                          **** {currentUser.bankAccount.accountNumber?.slice(-4)}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsPaymentMethodDialogOpen(true)}>Edit</Button>
                  </div>
                ) : (
                  <div className="text-center p-8 border border-dashed rounded-md">
                    <BanknoteIcon className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <h3 className="font-medium mb-1">No Payment Methods Added</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add a bank account or payment method to receive your withdrawals
                    </p>
                    <Button onClick={() => setIsPaymentMethodDialogOpen(true)}>Add Payment Method</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Wallet;

import { useState } from "react";
import { toast } from "sonner";
import { Printer, CheckCircle2, AlertTriangle, PlusCircle, Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePrinter } from "@/hooks/use-printer";
import { ReceiptDocument } from "./ReceiptDocument";
import { PrintPortal } from "@/components/common/PrintPortal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * HADRAN FABRICS MALL — Receipt preview & print flow.
 * Shows the 80mm receipt after checkout (or from history reprint),
 * with the printer paper-check prompt before printing.
 */

interface ReceiptPreviewProps {
  saleId: number | null;
  open: boolean;
  onClose: () => void;
  /** "checkout" shows success banner + New Sale; "reprint" just prints. */
  mode: "checkout" | "reprint";
  paperCheckEnabled: boolean;
}

export function ReceiptPreview({ saleId, open, onClose, mode, paperCheckEnabled }: ReceiptPreviewProps) {
  const { print } = usePrinter();
  const [paperPrompt, setPaperPrompt] = useState(false);
  const [printing, setPrinting] = useState(false);

  const query = trpc.sales.receiptData.useQuery(
    { id: saleId! },
    { enabled: open && saleId != null, retry: 1 },
  );

  const doPrint = async () => {
    setPrinting(true);
    try {
      await print();
      toast.success("Sent to printer.", {
        description: "If nothing came out, check paper and use Print again.",
      });
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintClick = () => {
    if (paperCheckEnabled) {
      setPaperPrompt(true); // "Is the printer ready with paper?" prompt
    } else {
      void doPrint();
    }
  };

  return (
    <>
      {/* Print-only copy — lives outside the app tree; the ONLY thing
          visible to the printer thanks to the #print-root print CSS. */}
      {open && query.data && (
        <PrintPortal>
          <div className="print-receipt">
            <ReceiptDocument data={query.data} config={query.data.config} />
          </div>
        </PrintPortal>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-gold-500/30 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-navy-900">
              {mode === "checkout" ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Sale Completed
                </>
              ) : (
                <>
                  <Printer className="h-5 w-5 text-gold-600" />
                  Receipt Reprint
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {mode === "checkout"
                ? "Payment recorded and stock updated. Print the customer's receipt below."
                : "Preview of the stored receipt — identical to the original print."}
            </DialogDescription>
          </DialogHeader>

          {query.isLoading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-gold-600" />
            </div>
          ) : query.data ? (
            <div className="rounded-lg border border-border bg-cream-200/50 p-3 shadow-inner">
              <ReceiptDocument data={query.data} config={query.data.config} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-red-600">Could not load the receipt.</p>
          )}

          <DialogFooter className="gap-2">
            <Button
              onClick={handlePrintClick}
              disabled={!query.data || printing}
              className="bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4 text-gold-400" />}
              Print Receipt
            </Button>
            {mode === "checkout" ? (
              <Button onClick={onClose} className="bg-gold-500 text-navy-900 hover:bg-gold-400">
                <PlusCircle className="mr-2 h-4 w-4" />
                New Sale
              </Button>
            ) : (
              <Button variant="outline" onClick={onClose} className="border-border">Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paper / printer readiness prompt */}
      <AlertDialog open={paperPrompt} onOpenChange={setPaperPrompt}>
        <AlertDialogContent className="border-gold-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-navy-900">
              <AlertTriangle className="h-5 w-5 text-gold-600" />
              Printer Check
            </AlertDialogTitle>
            <AlertDialogDescription>
              Make sure the receipt printer is <strong>switched on</strong> and{" "}
              <strong>has paper</strong>. If it's out of paper, load a roll first — then continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => toast.warning("Printing paused — load paper in the printer, then try again.")}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              No Paper / Not Ready
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void doPrint()}
              className="bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              Printer Ready — Print
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

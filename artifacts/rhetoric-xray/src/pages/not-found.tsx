import { ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <ShieldAlert className="w-16 h-16 text-muted-foreground mb-6" />
      <h1 className="text-4xl font-serif font-bold mb-4 text-foreground">找不到頁面</h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md">
        您想尋找的紀錄或頁面可能已經被移除，或是網址有誤。
      </p>
      <Link href="/">
        <Button size="lg">返回首頁</Button>
      </Link>
    </div>
  );
}

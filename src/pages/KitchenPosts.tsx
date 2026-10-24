import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, Plus, Upload, X, Loader2, Pencil, Trash2, Video, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { api, ApiError, getAccessToken } from "@/services/api";
import { kitchenPostService, KitchenPost, KitchenPostInput } from "@/services/siteContent.service";

const MAX_PHOTOS = 10;
const EMPTY: KitchenPostInput = { title: "", body: "", images: [], videoUrl: "", isPublished: true };

// A 422 says "Validation failed"; the field's own message ("Paste a YouTube or Instagram link") is the useful one.
const errMsg = (err: unknown, fallback: string) =>
  (err instanceof ApiError && err.errors?.[0]?.message) || (err instanceof Error && err.message) || fallback;

async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const token = getAccessToken();
  const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/upload/image`, {
    method: "POST",
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.data.url;
}

/** "Inside our kitchen" posts the website shows: text, photos and a YouTube / Instagram link. */
export default function KitchenPosts() {
  const [posts, setPosts] = useState<KitchenPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<KitchenPostInput | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<KitchenPost | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      api.clearCache("/site-content");
      setPosts(await kitchenPostService.list());
    } catch (err) {
      toast.error(errMsg(err, "Couldn't load kitchen posts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditId(null); setForm({ ...EMPTY }); };
  const openEdit = (p: KitchenPost) => {
    setEditId(p.id);
    setForm({ title: p.title, body: p.body ?? "", images: p.images, videoUrl: p.videoUrl ?? "", isPublished: p.isPublished });
  };
  const close = () => { setForm(null); setEditId(null); };

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!form || files.length === 0) return;
    const room = MAX_PHOTOS - form.images.length;
    if (files.length > room) toast.error(`At most ${MAX_PHOTOS} photos per post`);
    setUploading(true);
    try {
      for (const file of files.slice(0, room)) {
        if (!file.type.startsWith("image/")) { toast.error(`${file.name}: only image files allowed`); continue; }
        if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}: image must be under 5MB`); continue; }
        const url = await uploadPhoto(file);
        setForm((f) => (f ? { ...f, images: [...f.images, url] } : f));
      }
    } catch (err) {
      toast.error(errMsg(err, "Photo upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form) return;
    if (form.title.trim().length < 2) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const data = { ...form, title: form.title.trim(), body: form.body?.trim() || null, videoUrl: form.videoUrl?.trim() || null };
      if (editId) await kitchenPostService.update(editId, data);
      else await kitchenPostService.create(data);
      toast.success(editId ? "Post updated" : "Post added");
      close();
      load();
    } catch (err) {
      toast.error(errMsg(err, "Couldn't save the post"));
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (p: KitchenPost) => {
    try {
      await kitchenPostService.update(p.id, { isPublished: !p.isPublished });
      setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, isPublished: !p.isPublished } : x)));
    } catch (err) {
      toast.error(errMsg(err, "Couldn't update the post"));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await kitchenPostService.remove(toDelete.id);
      setPosts((list) => list.filter((x) => x.id !== toDelete.id));
      if (editId === toDelete.id) close();
      toast.success("Post removed");
    } catch (err) {
      toast.error(errMsg(err, "Couldn't remove the post"));
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Camera className="h-5 w-5" />}
        title="Kitchen Posts"
        subtitle="The website's “Inside our kitchen” page: stories, photos and videos from the kitchen. Same posts for every branch."
        actions={!form && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />New post</Button>}
      />

      {form && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader><CardTitle className="text-base">{editId ? "Edit post" : "New post"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="kp-title">Title</Label>
              <Input id="kp-title" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="How we make our pizza dough" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kp-body">Text (optional)</Label>
              <Textarea id="kp-body" value={form.body ?? ""} maxLength={10000} rows={6} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the story. Leave empty for a photo or video post." />
            </div>

            <div className="space-y-1.5">
              <Label>Photos ({form.images.length}/{MAX_PHOTOS})</Label>
              <input type="file" accept="image/*" multiple ref={fileInputRef} className="hidden" onChange={handlePhotos} />
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {form.images.map((url, i) => (
                  <div key={url} className="relative">
                    <img src={url} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, images: form.images.filter((u) => u !== url) })}
                      className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                      title="Remove photo"
                      aria-label={`Remove photo ${i + 1}`}
                    ><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                {form.images.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50"
                  >
                    {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6" />}
                    <span className="text-xs">{uploading ? "Uploading..." : "Add photos"}</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Max 5MB each — JPG, PNG, WebP</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kp-video">Video link (optional)</Label>
              <Input id="kp-video" value={form.videoUrl ?? ""} maxLength={300} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtu.be/… or https://www.instagram.com/reel/…" />
              <p className="text-xs text-muted-foreground">Upload the video to YouTube or Instagram, then paste its link here.</p>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="kp-published" checked={form.isPublished} onCheckedChange={(v) => setForm({ ...form, isPublished: v })} />
              <Label htmlFor="kp-published">Show on the website</Label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving || uploading}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && posts.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : posts.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Camera className="h-6 w-6" /></span>
            <p className="font-semibold">No kitchen posts yet</p>
            <p className="text-sm text-muted-foreground">Add the first one; it shows on the website's “Inside our kitchen” page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((p) => (
            <Card key={p.id} className="flex flex-col overflow-hidden shadow-sm">
              {p.images[0] ? (
                <img src={p.images[0]} alt={p.title} className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
                  {p.videoEmbedUrl ? <Video className="h-8 w-8" /> : <Camera className="h-8 w-8" />}
                </div>
              )}
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {!p.isPublished && <Badge variant="outline">Hidden</Badge>}
                  {p.images.length > 0 && <Badge variant="secondary">{p.images.length} photo{p.images.length > 1 ? "s" : ""}</Badge>}
                  {p.videoEmbedUrl && <Badge variant="secondary">Video</Badge>}
                </div>
                <p className="font-semibold leading-snug">{p.title}</p>
                {p.body && <p className="line-clamp-3 text-sm text-muted-foreground">{p.body}</p>}
                <p className="mt-auto text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => togglePublished(p)}>
                    {p.isPublished ? <><EyeOff className="h-4 w-4 mr-1.5" />Hide</> : <><Eye className="h-4 w-4 mr-1.5" />Show</>}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setToDelete(p)} aria-label={`Delete ${p.title}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>“{toDelete?.title}” will be removed from the website. To keep it but take it off the website, use Hide instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

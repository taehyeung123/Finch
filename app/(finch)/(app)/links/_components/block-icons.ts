import type { BlockType } from "@/lib/links/blocks";
import {
  BookOpen,
  Contact,
  FileDown,
  GalleryHorizontal,
  Heading,
  Heart,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Link2,
  MapPin,
  Megaphone,
  MessageSquare,
  Mail,
  Minus,
  MoveVertical,
  Music2,
  Play,
  Rss,
  Search,
  ShoppingBag,
  Type,
} from "lucide-react";

/*
  블록 타입 → 아이콘. 블록 목록·추가 카탈로그(links-client)와 캔버스 자리표시자
  (phone-preview GhostCard)가 같은 그림을 쓰게 한 곳에 둔다 — 목록에서 본 아이콘이
  캔버스에서 다르면 같은 블록으로 안 읽힌다.
*/
export const BLOCK_ICON: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  link: Link2,
  heading: Heading,
  text: Type,
  divider: Minus,
  spacer: MoveVertical,
  image: ImageIcon,
  image_card: ShoppingBag,
  video: Play,
  card_row: GalleryHorizontal,
  grid: LayoutGrid,
  notice: Megaphone,
  social_feed: Rss,
  contact: MessageSquare,
  subscribe: Mail,
  map: MapPin,
  coupang: ShoppingBag,
  donation: Heart,
  gallery: Images,
  music: Music2,
  vcard: Contact,
  search: Search,
  file: FileDown,
  guestbook: BookOpen,
};

# Nguồn bản sao skill

- Repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Commit cố định: a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5
- Thư mục nguồn: .claude/skills/ui-ux-pro-max/
- Thư mục đích: .agents/skills/ui-ux-pro-max/
- Giấy phép gốc: LICENSE tại cùng commit, sao chép nguyên văn vào LICENSE.
- Toàn bộ 70 file trong thư mục nguồn và LICENSE được kiểm tra Git blob SHA-1
  theo tree của commit trước khi ghi. Không dùng installer, npm package hoặc
  lấy các skill phụ.
- Thay đổi cục bộ duy nhất trên file upstream: thêm phần hướng dẫn đường dẫn
  Codex/Windows ở đầu SKILL.md. Giữ nguyên nội dung upstream còn lại và mọi script.
- SOURCE.md này là ghi chú tích hợp của dự án.
- Giữ data/data-provenance.json, data/google-font-licenses.json và
  data/phosphor-icons-upstream.json cùng dữ liệu để bảo toàn thông tin nguồn.
  Đây là metadata; không tải hoặc cài font, bộ icon hay thư viện UI cho ứng dụng.
- Chạy truy vấn bằng py -3 -B; không dùng --persist nên không tạo design-system/.
- Chỉ skill trong thư mục này được cài ở cấp dự án; không thay AGENTS.md,
  package.json, lockfile hoặc cấu hình tài khoản.
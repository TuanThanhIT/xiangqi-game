import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { ProfileController } from "./profile.controller";
import { AvatarPipe, NicknamePipe } from "./profile.pipe";
import { ProfileService } from "./profile.service";
@Module({imports:[DatabaseModule,AuthModule],controllers:[ProfileController],providers:[ProfileService,NicknamePipe,AvatarPipe]})
export class ProfileModule{}

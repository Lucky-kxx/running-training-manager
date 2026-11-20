import { Module } from '@nestjs/common';

import { AiModule } from '../ai';
import { AuthModule } from '../auth';
import { CalendarModule } from '../calendar/calendar.module';
import { CoreModule } from '../core/core.module';
import { QueueModule } from '../queue/queue.module';
import { SubscriptionModule } from '../subscription';
import { WebSocketModule } from '../websocket/websocket.module';
import { AIFeaturesController } from './controllers/ai-features.controller';
import { TrainingCoachController } from './controllers/training-coach.controller';
import { EventGenerationService } from './services/event-generation.service';
import { EventModificationService } from './services/event-modification.service';
import { TrainingCoachChatService } from './services/training-coach-chat.service';
import { TrainingCoachService } from './services/training-coach.service';

@Module({
  imports: [
    AiModule,
    AuthModule,
    CalendarModule,
    CoreModule,
    QueueModule,
    SubscriptionModule,
    WebSocketModule,
  ],
  controllers: [AIFeaturesController, TrainingCoachController],
  providers: [
    EventGenerationService,
    EventModificationService,
    TrainingCoachChatService,
    TrainingCoachService,
  ],
})
export class AgentModule {}

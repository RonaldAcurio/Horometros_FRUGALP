import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupervisorPanel } from './supervisor-panel';

describe('SupervisorPanel', () => {
  let component: SupervisorPanel;
  let fixture: ComponentFixture<SupervisorPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupervisorPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(SupervisorPanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

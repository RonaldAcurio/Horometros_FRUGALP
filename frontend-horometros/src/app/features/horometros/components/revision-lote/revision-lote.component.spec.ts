import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RevisionLoteComponent } from './revision-lote.component';

describe('RevisionLoteComponent', () => {
  let component: RevisionLoteComponent;
  let fixture: ComponentFixture<RevisionLoteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RevisionLoteComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RevisionLoteComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
